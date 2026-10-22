/** @fileoverview 루트에서 위치 감지와 알림 응답 구독을 연결하고 오류를 앱 스토어에 공유한다. */
import { useEffect, useRef } from 'react';
import { useSubwayAlerts } from '@/features/subway/model/use-subway-alerts';
import { useSubwayMonitoringSessions } from '@/features/subway/model/use-subway-monitoring-sessions';
import { readCachedSubwayAlerts } from '@/features/subway/model/subway-alert-storage';
import type { SubwayAlert } from '@/features/subway/model/subway-alert';
import { getSubwayAlerts } from '@/features/subway/api/subway-alerts';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { checkNearbyStops, preparePush, syncGeofences } from './alert-runtime';
import { alertStorage, cacheAlerts, readCachedAlerts } from './alert-storage';
import { useAppStore } from '@/shared/model/app-store';
import { useAlerts } from './use-alerts';
import { useMonitoringSessions } from './use-monitoring-sessions';
import type { BusAlert } from './bus-alert';
import { getAlerts } from '../api/alerts';

/** 루트 런타임 컴포넌트에서 위치·알림 구독을 연결하고 효과 정리 시 각 네이티브 구독을 해제한다. */
export function useAlertRuntime() {
  /** 알림 응답을 처리하기 전 루트 내비게이터가 준비됐는지 확인하는 상태다. */
  const navigation = useRootNavigationState();

  /** 접근 동의 시 감시 시작, 만료 안내의 연장·중지 액션을 처리하는 서버 조작 함수들이다. */
  const { begin, extend, stop } = useMonitoringSessions();
  const {
    begin: beginSubway,
    extend: extendSubway,
    stop: stopSubway,
  } = useSubwayMonitoringSessions();
  const { data: subwayAlerts } = useSubwayAlerts();
  const latestSubway = useRef<SubwayAlert[]>([]);

  /** 마지막 처리 키는 화면 상태가 아니므로 ref에 보관해 렌더 없이 동일 응답 중복 처리를 막는다. 재마운트 시에는 초기화된다. */
  const handledResponse = useRef<string | undefined>(undefined);

  /** 현재 기기에 저장된 서버 알림 목록으로, 필터와 감시 설정의 원본이다. */
  const { data: alerts } = useAlerts();

  /** 알림으로 진입할 때 숨겨진 지도 탭을 다시 표시한다. */
  const setMapTabHidden = useAppStore((state) => state.setMapTabHidden);

  /** 알림 목록을 다시 확인하고 앱 복귀 시 관련 서버 상태를 무효화하는 공유 캐시다. */
  const queryClient = useQueryClient();

  /** 위치 구독이 최신 알림을 읽도록 보관한다. 값 변경 자체는 렌더를 요청하지 않는다. */
  const latest = useRef<BusAlert[]>([]);

  /** 알림 오류를 표시하는 화면과 공유하는 스토어 액션이다. 탭 상태 변경에는 재구독하지 않는다. */
  const setError = useAppStore((state) => state.setAlertRuntimeError);

  /** 런타임 시작과 해제 시 일시적 오류를 초기화한다. 스토어 액션 참조가 바뀌면 다시 등록한다. */
  useEffect(() => {
    setError(null);
    return () => setError(null);
  }, [setError]);

  /** 알림 목록이 바뀌면 기기 사본과 지오펜스를 동기화한다. 정리 시 진행 중 준비를 무효화하고 이전 위치 구독을 해제한다. */
  useEffect(() => {
    /** 비동기 준비 중 효과가 정리됐는지 표시해 오래된 준비 결과의 구독·상태 반영을 막는다. */
    let disposed = false;

    /** 현재 효과가 만든 위치 감시 핸들이며 효과 정리 때 해제한다. */
    let subscription: Location.LocationSubscription | undefined;

    /** 캐시 복원·영역 등록 후 위치 구독을 시작하며 비동기 완료 전 정리 여부를 확인한다. */
    async function start() {
      try {
        /** 서버 목록이 아직 없으면 기기 사본으로 감시를 복원한다. */
        const saved = alerts ?? (await readCachedAlerts());
        if (disposed) return;
        latest.current = saved;
        const savedSubway = subwayAlerts ?? (await readCachedSubwayAlerts());
        latestSubway.current = savedSubway;
        if (alerts) await cacheAlerts(alerts);
        if (disposed) return;
        await syncGeofences(saved, savedSubway);
        if (disposed) return;
        setError(null);
        if (![...saved, ...savedSubway].some((a) => a.enabled && a.proximityEnabled)) return;
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 30 },
          (position) => {
            void checkNearbyStops(position, latest.current, latestSubway.current).catch(() => {
              if (!disposed) setError('접근 알림에 실패했어요. 위치·알림 권한을 확인해주세요.');
            });
          },
        );
        if (disposed) subscription.remove();
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : '접근 감지를 시작하지 못했어요.');
      }
    }
    void start();
    return () => {
      disposed = true;
      subscription?.remove();
    };
  }, [alerts, subwayAlerts, setError]);

  /** 루트 내비게이션 준비 후 마지막 응답과 새 알림·토큰·앱 복귀 이벤트를 연결한다. 의존하는 캐시·조작 함수가 바뀌면 재구독하고 이전 리스너를 모두 제거한다. */
  useEffect(() => {
    if (!navigation?.key) return;

    /** 해제된 알림 구독의 비동기 결과가 전역 오류를 다시 기록하지 못하도록 구분한다. */
    let disposed = false;

    /** 알림 종류와 액션을 확인해 감시 조작 또는 해당 화면 이동을 수행한다. */
    async function open(response: Notifications.NotificationResponse) {
      /** OS 알림 페이로드로, 알림 종류·사용자 액션에 맞는 화면과 감시를 결정한다. */
      const data = response.notification.request.content.data;
      if (!data) return;

      /** OS 알림 식별자로 중복 응답 구분과 지도 이동 요청에 사용한다. */
      const id = response.notification.request.identifier;

      /** 같은 알림이라도 제안·만료 시각과 액션이 다르면 구분하는 처리 키다. */
      const responseKey = `${id}:${data.promptId ?? data.monitoringEndsAt ?? ''}:${response.actionIdentifier}`;
      if (handledResponse.current === responseKey || typeof data.alertId !== 'string') return;
      handledResponse.current = responseKey;
      setMapTabHidden(false);
      try {
        if (
          data.kind === 'subway-proximity-prompt' ||
          data.kind === 'subway-monitoring-extension'
        ) {
          const all = await queryClient.fetchQuery({
            queryKey: ['subway-alerts'],
            queryFn: () => getSubwayAlerts(),
            staleTime: 0,
          });
          const listParams = {
            alertTransport: 'subway',
            alertKind: 'location',
            alertId: '',
            sourceAlertId: '',
            sourceAlertIds: '',
            stationId: '',
            routeId: '',
            requestId: responseKey,
          };
          if (data.kind === 'subway-proximity-prompt') {
            const ids = Array.isArray(data.alertIds)
              ? data.alertIds.filter((id): id is string => typeof id === 'string')
              : [data.alertId];
            const day = new Date(Date.now() + 9 * 60 * 60_000).getUTCDay();
            const sources = all.filter(
              (a) => ids.includes(a.id) && a.enabled && a.proximityEnabled && a.days.includes(day),
            );
            if (!sources.length) throw new Error('위치 기반 알림이 삭제되었거나 꺼져 있습니다.');
            if (response.actionIdentifier === 'OPEN_SETTINGS') {
              router.navigate({
                pathname: '/subway-alerts',
                params: {
                  alertKind: 'location',
                  stationName: sources[0].stationName,
                  alertId: sources[0].id,
                  requestId: responseKey,
                },
              });
            } else {
              if (response.actionIdentifier === 'START_MONITORING') {
                for (const source of sources) await beginSubway(source);
              } else {
                listParams.sourceAlertId = sources[0].id;
                listParams.sourceAlertIds = sources.map((source) => source.id).join(',');
              }
              router.navigate({ pathname: '/alerts', params: listParams });
            }
          } else {
            const selected = all.find(
              (a) =>
                a.id === data.alertId &&
                a.enabled &&
                a.monitoringSourceId &&
                a.monitoringEndsAt === data.monitoringEndsAt,
            );
            if (selected && response.actionIdentifier === 'EXTEND_MONITORING')
              await extendSubway(selected);
            if (selected && response.actionIdentifier === 'STOP_MONITORING')
              await stopSubway(selected);
            router.navigate({ pathname: '/alerts', params: listParams });
          }
          await Notifications.clearLastNotificationResponseAsync();
          return;
        }
        if (data.kind === 'subway-arrival' && typeof data.stationName === 'string') {
          router.navigate({
            pathname: '/subway-alerts',
            params: {
              alertKind: 'time',
              sourceAlertId: '',
              sourceAlertIds: '',
              stationName: data.stationName,
              alertId: data.alertId,
              requestId: responseKey,
            },
          });
          await Notifications.clearLastNotificationResponseAsync();
          return;
        }
        if (data.kind === 'proximity-prompt') {
          /** 접근 알림이 생성된 뒤 설정이 바뀌었을 수 있어 서버에서 다시 확인한 최신 목록이다. */
          const savedAlerts = await queryClient.fetchQuery({
            queryKey: ['alerts', 'list'],
            queryFn: () => getAlerts(),
          });

          /** 페이로드에서 문자열인 알림 ID만 추려 서버의 현재 설정과 대조한다. */
          const ids = Array.isArray(data.alertIds)
            ? data.alertIds.filter((value): value is string => typeof value === 'string')
            : [data.alertId];

          /** 아직 켜져 있는 접근 알림만 골라 삭제·해제된 설정의 감시 시작을 막는다. */
          const sources = savedAlerts.filter(
            (a) => ids.includes(a.id) && a.enabled && a.proximityEnabled,
          );
          if (!sources.length) throw new Error('위치 기반 알림이 삭제되었거나 꺼져 있습니다.');
          if (response.actionIdentifier === 'START_MONITORING') {
            for (const source of sources) await begin(source);
            router.navigate({
              pathname: '/alerts',
              params: {
                alertTransport: 'bus',
                alertKind: 'location',
                requestId: responseKey,
                monitoringId: sources[0].id,
                sourceAlertId: '',
                sourceAlertIds: '',
                alertId: '',
                stationId: '',
                routeId: '',
              },
            });
          } else {
            router.navigate({
              pathname: '/alerts',
              params: {
                alertTransport: 'bus',
                alertKind: 'location',
                sourceAlertId: sources[0].id,
                sourceAlertIds: sources.map((a) => a.id).join(','),
                requestId: responseKey,
                alertId: '',
                stationId: '',
                routeId: '',
              },
            });
          }
          await Notifications.clearLastNotificationResponseAsync();
          return;
        }
        if (data.kind === 'monitoring-extension') {
          /** 만료 응답 대상이 여전히 유효한지 확인할 최신 서버 목록이다. */
          const all = await queryClient.fetchQuery({
            queryKey: ['alerts', 'list'],
            queryFn: () => getAlerts(),
          });

          /** 서버가 확정한 임시 감시 레코드로, 종료 안내 예약의 ID와 만료 시각을 제공한다. */
          const session = all.find(
            (a) =>
              a.id === data.alertId &&
              a.enabled &&
              a.monitoringSourceId &&
              a.monitoringEndsAt === data.monitoringEndsAt,
          );
          if (session) {
            if (response.actionIdentifier === 'EXTEND_MONITORING') await extend(session);
            if (response.actionIdentifier === 'STOP_MONITORING') await stop(session);
            router.navigate({
              pathname: '/alerts',
              params: {
                alertTransport: 'bus',
                alertKind: 'location',
                monitoringId: session.id,
                requestId: responseKey,
                sourceAlertId: '',
                sourceAlertIds: '',
                alertId: '',
                stationId: '',
                routeId: '',
              },
            });
          }
          await Notifications.clearLastNotificationResponseAsync();
          return;
        }

        /** 페이로드에 정류소 ID와 숫자 좌표가 있어 서버 조회 없이 지도 위치를 복원할 수 있는지 판정한다. */
        const hasStop =
          typeof data.stationId === 'string' &&
          typeof data.latitude === 'number' &&
          typeof data.longitude === 'number';

        /** 페이로드에 좌표가 없을 때 서버의 기존 알림으로 정류소 정보를 보충한다. */
        const saved = hasStop
          ? undefined
          : (
              await queryClient.fetchQuery({
                queryKey: ['alerts', 'list'],
                queryFn: () => getAlerts(),
              })
            ).find((a) => a.id === data.alertId);

        /** 저장된 정류소 좌표를 우선하고 없으면 페이로드에서 복원한 위도다. */
        const latitude = saved?.stop.latitude ?? Number(data.latitude);

        /** 저장된 정류소 좌표를 우선하고 없으면 페이로드에서 복원한 경도다. */
        const longitude = saved?.stop.longitude ?? Number(data.longitude);

        /** 검증 후 지도 화면에 전달할 정류소 식별자다. */
        const stationId = saved?.stationId ?? data.stationId;
        if (
          typeof stationId !== 'string' ||
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        )
          throw new Error('알림의 정류장 정보를 찾을 수 없습니다.');
        router.navigate({
          pathname: '/',
          params: {
            stationId,
            latitude: String(latitude),
            longitude: String(longitude),
            notificationId: id,
          },
        });
        await Notifications.clearLastNotificationResponseAsync();
      } catch (e) {
        handledResponse.current = undefined;
        if (!disposed) setError(e instanceof Error ? e.message : '알림 정류장을 열지 못했어요.');
      }
    }

    /** 앱이 닫힌 동안 선택된 알림 응답으로, 구독을 연결하기 전에 처리한다. */
    const response = Notifications.getLastNotificationResponse();
    if (response) void open(response);

    /** 실행 중 선택한 알림의 응답 구독이며 효과 정리 때 제거한다. */
    const listener = Notifications.addNotificationResponseReceivedListener((response) => {
      void open(response);
    });

    /** 네이티브 푸시 토큰이 변경되면 서버 등록을 갱신하는 구독이며 정리 때 제거한다. */
    const tokenListener = Notifications.addPushTokenListener((token) => {
      void preparePush(token).then(() =>
        queryClient.invalidateQueries({ queryKey: ['alerts', 'push-status'] }),
      );
    });

    /** 앱 복귀 시 버스·지하철 알림과 기기 저장 오류를 다시 확인하는 구독이며 정리 때 제거한다. */
    const appListener = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      void queryClient.invalidateQueries({ queryKey: ['subway-alerts'] });
      void alertStorage.getItem('tarago-proximity-error').then((error) => {
        if (!disposed) setError(error);
      });
    });
    return () => {
      disposed = true;
      listener.remove();
      tokenListener.remove();
      appListener.remove();
    };
  }, [
    queryClient,
    setMapTabHidden,
    setError,
    navigation?.key,
    begin,
    extend,
    stop,
    beginSubway,
    extendSubway,
    stopSubway,
  ]);
}
