import { getSubwayMapStations } from '../api/get-subway-station';
import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  ensureNotificationPermission,
  ensureProximityPermission,
  preparePush,
} from '@/features/bus-alert/model/alert-runtime';
import { usePushStatus } from '@/features/bus-alert/model/use-alerts';
import {
  alertErrorMessage,
  resolveAlertKind,
  type AlertKind,
} from '@/features/bus-alert/model/alert-form';
import { useSubwayAlerts, useSubwayAlertMutations } from './use-subway-alerts';
import type { SubwayStationDetail, SubwayTimetable } from '../api/get-subway-station';
import type { SubwayArrivals } from '../api/get-subway-arrivals';
import { subwayDirectionPresentation } from './subway-direction';
import { buildSubwayAlertInput } from './subway-alert-form';
import type { SubwayAlert, SubwayAlertInput } from './subway-alert';

export type SubwayAlertDraft = SubwayAlertInput & { id?: string };

/** 지하철 예약의 초안·권한·저장 흐름을 화면 표시와 분리한다. */
export function useSubwayAlertScreen(
  initial: SubwayAlertDraft | null,
  initialKind: AlertKind = 'time',
) {
  const operation = useRef(false);
  const [kind, setKind] = useState<AlertKind>(() => resolveAlertKind(initial, initialKind));

  /** 푸시 준비 후 다른 화면도 최신 연결 상태를 읽도록 Query 캐시를 무효화할 클라이언트다. */
  const client = useQueryClient();

  /** 목록 화면에 표시할 기기별 지하철 알림 Query다. */
  const list = useSubwayAlerts();

  /** 서버 예약 저장·삭제와 목록 캐시 동기화를 수행할 mutation 쌍이다. */
  const { save, remove } = useSubwayAlertMutations();

  /** 예약 알림을 받을 수 있는 현재 기기의 서버 푸시 연결 상태다. */
  const { data: pushStatus } = usePushStatus();

  /** 사용자가 편집 중인 예약 초안이다. null이면 저장된 예약 목록을 표시한다. */
  const [draft, setDraft] = useState<SubwayAlertDraft | null>(initial);

  /** 숫자 입력 도중의 빈 값도 보존하는 도착 기준 분 문자열이다. 저장 시 숫자로 검증한다. */
  const [threshold, setThreshold] = useState(String(initial?.thresholdMinutes ?? 5));

  /** 권한 준비·예약 저장 작업이 끝날 때까지 중복 조작을 막는 표시 상태다. */
  const [busy, setBusy] = useState(false);

  /** 푸시 준비 결과로 받은 연결 경고 문구다. 예약 목록의 연결 상태 안내와 함께 표시한다. */
  const [warning, setWarning] = useState<string | null>(null);

  /** 알림 권한과 푸시 연결을 준비하고 다른 화면의 연결 상태 캐시를 갱신한다. */
  const prepare = async () => {
    await ensureNotificationPermission();
    setWarning(await preparePush());
    await client.invalidateQueries({ queryKey: ['alerts', 'push-status'] });
  };

  /**
   * 중복 저장을 막고 활성 예약에 필요한 푸시 준비 후 서버에 저장한다.
   * @param input 생성 또는 수정할 예약 초안.
   */
  const persist = async (input: SubwayAlertDraft) => {
    if (operation.current || remove.isPending) return;
    operation.current = true;
    setBusy(true);
    try {
      if (input.enabled) {
        if (input.proximityEnabled) {
          await ensureNotificationPermission();
          await ensureProximityPermission();
        }
        if (input.scheduledEnabled !== false || input.proximityEnabled) await prepare();
      }
      const station = client.getQueryData<SubwayStationDetail>([
        'subway',
        input.stationName,
        'station',
      ]);
      const live = client.getQueryData<SubwayArrivals>(['subway', input.stationName, 'arrivals']);
      const day = new Date(Date.now() + 9 * 3600_000 - 3 * 3600_000).getUTCDay();
      const timetable = client.getQueryData<SubwayTimetable>([
        'subway',
        input.stationName,
        input.lineId,
        'timetable',
        day === 6 ? 'saturday' : day === 0 ? 'holiday' : 'weekday',
      ]);
      const line = station?.lines.find((l) => l.lineId === input.lineId) ?? {
        lineId: input.lineId,
        previousStation: null,
        nextStation: null,
      };
      const labels = subwayDirectionPresentation(
        line,
        input.direction,
        live?.arrivals ?? [],
        timetable?.directions,
      );
      await save.mutateAsync({
        input: {
          ...input,
          ...(!input.nextStationName && labels.nextStationName
            ? { nextStationName: labels.nextStationName }
            : {}),
          ...(!input.destinationNames?.length && labels.destinationNames.length
            ? { destinationNames: labels.destinationNames }
            : {}),
        },
        id: input.id,
      });
      setDraft(null);
    } catch (error) {
      Alert.alert('알림을 저장하지 못했어요', alertErrorMessage(error));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };

  /** 반복 요일·시간·기준 분·알림 단계를 검증한 뒤 저장한다. 자정을 넘는 감시 시간은 허용한다. */
  const submit = async () => {
    if (!draft || busy || operation.current) return;
    setBusy(true);
    try {
      let resolved = draft;
      if (
        draft.proximityEnabled &&
        (!Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude))
      ) {
        const stations = await client.fetchQuery({
          queryKey: ['subway', 'map-stations'],
          queryFn: ({ signal }) => getSubwayMapStations(signal),
          staleTime: 86_400_000,
        });
        const normalize = (name: string) => name.trim().replace(/역$/, '');
        const station = stations.find(
          (s) =>
            normalize(s.name) === normalize(draft.stationName) &&
            (!draft.lineName || s.lineName === draft.lineName),
        );
        if (!station) throw new Error('지도에서 알림 대상 역을 다시 선택해주세요.');
        resolved = { ...draft, latitude: station.latitude, longitude: station.longitude };
      }
      await persist(buildSubwayAlertInput(resolved, kind, threshold));
    } catch (error) {
      Alert.alert('설정을 확인해주세요', alertErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  /**
   * 삭제 확인을 받은 예약만 삭제하고 실패 원인을 표시한다.
   * @param alert 삭제 대상 예약.
   */
  const deleteAlert = (alert: SubwayAlert) =>
    Alert.alert('알림을 삭제할까요?', `${alert.stationName} · ${alert.direction}`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          if (operation.current) return;
          operation.current = true;
          setBusy(true);
          void remove
            .mutateAsync(alert.id)
            .catch((error) => Alert.alert('삭제하지 못했어요', alertErrorMessage(error)))
            .finally(() => {
              operation.current = false;
              setBusy(false);
            });
        },
      },
    ]);

  const reconnect = async () => {
    if (operation.current || remove.isPending) return;
    operation.current = true;
    setBusy(true);
    try {
      await prepare();
    } catch (error) {
      Alert.alert('알림 연결 확인', alertErrorMessage(error));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  };
  const selectKind = (next: AlertKind) => {
    if (operation.current || draft?.id) return;
    setKind(next);
  };
  const visibleAlerts = (list.data ?? []).filter(
    (a) =>
      !a.monitoringSourceId &&
      (kind === 'time' ? a.scheduledEnabled !== false : a.proximityEnabled),
  );
  const edit = (alert: SubwayAlert) => {
    setDraft(alert);
    setThreshold(String(alert.thresholdMinutes));
  };
  return {
    kind,
    selectKind,
    visibleAlerts,
    list,
    draft,
    setDraft,
    threshold,
    setThreshold,
    pushStatus,
    warning,
    busy: busy || save.isPending || remove.isPending,
    submit,
    persist,
    deleteAlert,
    reconnect,
    edit,
  };
}
