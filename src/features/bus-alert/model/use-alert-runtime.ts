/** @fileoverview 루트에서 위치 감지와 알림 응답 구독을 연결하고 오류를 앱 스토어에 공유한다. */
import { useEffect, useRef } from 'react';
import { useSubwayAlerts } from '@/features/subway/model/use-subway-alerts';
import {
  readCachedSubwayAlerts,
  cacheSubwayAlerts,
} from '@/features/subway/model/subway-alert-storage';
import type { SubwayAlert } from '@/features/subway/model/subway-alert';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { checkNearbyStops, preparePush, syncGeofences } from './alert-runtime';
import { alertStorage, cacheAlerts, readCachedAlerts } from './alert-storage';
import { useAppStore } from '@/shared/model/app-store';
import { useAlerts } from './use-alerts';
import type { BusAlert } from './bus-alert';
import { getAlerts } from '../api/alerts';
import { retryProximityReports } from './proximity-visits';

/** 루트 런타임 컴포넌트에서 위치·알림 구독을 연결하고 효과 정리 시 각 네이티브 구독을 해제한다. */
export function useAlertRuntime() {
  /** 알림 응답을 처리하기 전 루트 내비게이터가 준비됐는지 확인하는 상태다. */
  const navigation = useRootNavigationState();

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
    void Notifications.getAllScheduledNotificationsAsync()
      .then(async (scheduled) => {
        for (const notification of scheduled) {
          if (
            ['monitoring-extension', 'subway-monitoring-extension'].includes(
              String(notification.content.data?.kind),
            )
          ) {
            await Notifications.cancelScheduledNotificationAsync(notification.identifier);
          }
        }
      })
      .catch((error) =>
        setError(error instanceof Error ? error.message : '이전 감시 알림을 정리하지 못했어요.'),
      );
    return () => setError(null);
  }, [setError]);

  /** 알림 목록이 바뀌면 기기 사본과 지오펜스를 동기화한다. 정리 시 진행 중 준비를 무효화하고 이전 위치 구독을 해제한다. */
  useEffect(() => {
    /** 비동기 준비 중 효과가 정리됐는지 표시해 오래된 준비 결과의 구독·상태 반영을 막는다. */
    let disposed = false;

    /** 현재 효과가 만든 위치 감시 핸들이며 효과 정리 때 해제한다. */
    let subscription: Location.LocationSubscription | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let checking = false;
    async function inspect(force = false) {
      if (disposed || checking || AppState.currentState !== 'active') return;
      checking = true;
      try {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!disposed)
          await checkNearbyStops(position, latest.current, latestSubway.current, force);
      } catch (error) {
        if (!disposed)
          setError(error instanceof Error ? error.message : '위치 알림 상태를 확인하지 못했어요.');
      } finally {
        checking = false;
      }
    }
    const resume = AppState.addEventListener('change', (state) => {
      if (state === 'active') void inspect(true);
    });

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
        if (subwayAlerts) await cacheSubwayAlerts(subwayAlerts);
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
        else {
          await inspect(true);
          // 멈춰 서 있어 위치 이벤트가 없어도 실패한 상태 전송을 복구한다.
          if (!disposed) timer = setInterval(() => void inspect(), 30_000);
        }
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : '접근 감지를 시작하지 못했어요.');
      }
    }
    void start();
    return () => {
      disposed = true;
      subscription?.remove();
      resume.remove();
      if (timer) clearInterval(timer);
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
          data.kind === 'bus-proximity' ||
          data.kind === 'subway-proximity' ||
          data.kind === 'subway-arrival' ||
          data.kind === 'proximity-prompt' ||
          data.kind === 'subway-proximity-prompt'
        ) {
          const subway = String(data.kind).startsWith('subway-');
          router.navigate({
            pathname: '/alerts',
            params: {
              alertTransport: subway ? 'subway' : 'bus',
              alertKind: data.kind === 'subway-arrival' ? 'time' : 'location',
              alertId: data.alertId,
              sourceAlertId: '',
              sourceAlertIds: '',
              requestId: responseKey,
            },
          });
          await Notifications.clearLastNotificationResponseAsync();
          return;
        }
        // 이전 버전의 1시간 감시 알림은 새 감시를 시작하지 않고 위치 알림 목록으로 연다.
        if (data.kind === 'monitoring-extension' || data.kind === 'subway-monitoring-extension') {
          router.navigate({
            pathname: '/alerts',
            params: {
              alertTransport: String(data.kind).startsWith('subway-') ? 'subway' : 'bus',
              alertKind: 'location',
              requestId: responseKey,
            },
          });
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
      void retryProximityReports().catch((error) => {
        if (!disposed)
          setError(error instanceof Error ? error.message : '위치 알림 상태를 전송하지 못했어요.');
      });
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
  }, [queryClient, setMapTabHidden, setError, navigation?.key]);
}
