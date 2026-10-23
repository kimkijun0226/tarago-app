import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/shared/model/app-store';
import { useAlerts, useAlertMutations, usePushStatus } from './use-alerts';
import {
  ensureNotificationPermission,
  ensureProximityPermission,
  preparePush,
} from './alert-runtime';
import type { BusAlert, BusAlertInput } from './bus-alert';
import {
  buildBusAlertInput,
  resolveAlertKind,
  alertErrorMessage,
  type AlertDraft,
  type AlertKind,
} from './alert-form';

/** 알림 초안·권한·서버 변경을 연결한다. 서버 원본은 Query에만 둔다. */
export function useAlertScreen(initialDraft: AlertDraft | null, initialKind: AlertKind = 'time') {
  /** 현재 기기에 저장된 서버 알림 목록으로, 필터와 감시 설정의 원본이다. */
  const { data: alerts = [], isPending, isError, isFetching, refetch } = useAlerts();

  /** 예약 알림 경고와 목록의 감시 상태 표시에 사용할 서버 푸시 준비 상태다. */
  const { data: pushStatus } = usePushStatus();

  /** 목록의 저장·삭제 진행 상태와 서버 변이를 제공한다. */
  const { save, remove } = useAlertMutations();

  /** 권한 준비를 완료한 뒤 저장 결과를 기다리는 함수다. */
  const { mutateAsync: saveAsync } = save;

  /** 삭제 확인 후 실패를 사용자에게 전달할 수 있는 비동기 삭제 함수다. */
  const { mutateAsync: removeAsync } = remove;

  /** 루트에서 감지한 위치·알림 오류를 이 화면의 경고에 표시한다. */
  const runtimeError = useAppStore((state) => state.alertRuntimeError);

  /** 알림 쿼리의 조회 취소·갱신을 수행할 공유 QueryClient다. */
  const client = useQueryClient();

  /** 현재 편집 중인 로컬 입력이며 null이면 목록을 표시한다. 서버 원본은 Query가 계속 소유한다. */
  const [draft, setDraft] = useState<AlertDraft | null>(initialDraft);

  /** 현재 목록과 초안에 적용할 시간·위치 알림 방식을 선택하는 로컬 UI 상태다. */
  const [kind, setKind] = useState<AlertKind>(() => resolveAlertKind(initialDraft, initialKind));

  // 목록 필터는 현재 방식에 따른 단순 파생 값이다. 별도 캐시 없이 서버 데이터에서 바로 계산한다.
  /** 일회성 감시를 제외하고 현재 선택 방식에 해당하는 반복 설정만 남긴다. */
  const visibleAlerts = alerts.filter(
    (a) => !a.monitoringSourceId && (kind === 'time' ? a.scheduledEnabled : a.proximityEnabled),
  );

  const operation = useRef(false);

  /** 진행 중인 비동기 조작을 화면에 반영하고 중복 입력을 막는 로컬 상태다. */
  const [busy, setBusy] = useState(false);

  /** 푸시 준비 실패 사유를 저장해 서버 상태 갱신 전에도 연결 안내를 표시한다. */
  const [pushWarning, setPushWarning] = useState<string | null>(null);

  /** 직접 입력 중 빈 값 등도 표현할 수 있도록 분 기준을 문자열로 보관하는 폼 상태다. */
  const [threshold, setThreshold] = useState(String(initialDraft?.thresholdMinutes ?? 5));

  /** 목록 필터 변경은 편집 중인 기존 알림의 ID와 종류를 변경하지 않는다. */
  const selectKind = (value: AlertKind) => {
    if (draft?.id || busy) return;
    setKind(value);
    setDraft(
      (current) =>
        current && {
          ...current,
          scheduledEnabled: value === 'time',
          proximityEnabled: value === 'location',
        },
    );
  };

  /** 활성 알림의 권한과 예약 푸시를 준비한다. 저장·토글 콜백이 공유하므로 client 기준으로 참조를 유지한다. */
  const prepare = useCallback(
    async (input: BusAlertInput) => {
      if (!input.enabled) return;
      await ensureNotificationPermission();
      if (input.proximityEnabled) await ensureProximityPermission();
      if (input.scheduledEnabled || input.proximityEnabled) {
        setPushWarning(await preparePush());
        await client.invalidateQueries({ queryKey: ['alerts', 'push-status'] });
      }
    },
    [client],
  );

  /** 예약 조건을 검증하고 기존 복합 알림의 두 방식을 한 번에 보존하며 저장한다. */
  const submit = useCallback(async () => {
    if (!draft || operation.current) return;

    operation.current = true;
    setBusy(true);
    try {
      const input = buildBusAlertInput(draft, kind, threshold);
      await prepare(input);
      await saveAsync({ input, id: draft.id });
      setDraft(null);
    } catch (error) {
      Alert.alert('알림을 저장하지 못했어요', alertErrorMessage(error));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }, [draft, threshold, prepare, saveAsync, kind]);

  /** 알림 활성화 전 필요한 권한을 확인하고 서버에 반영한다. 준비·저장 함수가 같으면 참조를 유지한다. */
  const toggle = useCallback(
    async (alert: BusAlert, value: boolean) => {
      if (operation.current) return;
      operation.current = true;
      setBusy(true);
      try {
        /** 현재 방식과 검증된 기준 분·단계를 반영한 서버 저장 입력이다. */

        const input = { ...alert, enabled: value };
        await prepare(input);
        await saveAsync({ input, id: alert.id });
      } catch (error) {
        Alert.alert('알림을 변경하지 못했어요', alertErrorMessage(error));
      } finally {
        operation.current = false;
        setBusy(false);
      }
    },
    [prepare, saveAsync],
  );

  /** 사용자가 삭제를 확인한 경우에만 서버 삭제를 실행한다. 삭제 함수가 같으면 콜백을 재사용한다. */
  const removeAlert = useCallback(
    (alert: BusAlert) => {
      Alert.alert('알림을 삭제할까요?', `${alert.stop.name} · ${alert.busNumber}번`, [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            if (operation.current) return;
            operation.current = true;
            setBusy(true);
            void removeAsync(alert.id)
              .catch((error) => Alert.alert('삭제하지 못했어요', alertErrorMessage(error)))
              .finally(() => {
                operation.current = false;
                setBusy(false);
              });
          },
        },
      ]);
    },
    [removeAsync],
  );

  /** 기기 알림 권한과 푸시 등록을 다시 확인하고 서버 준비 상태를 새로 조회한다. client 기준으로 참조를 유지한다. */
  const reconnect = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      await ensureNotificationPermission();
      setPushWarning(await preparePush());
      await client.invalidateQueries({ queryKey: ['alerts', 'push-status'] });
    } catch (error) {
      Alert.alert('알림 연결 확인', alertErrorMessage(error));
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }, [client]);

  const edit = (alert: BusAlert) => {
    if (busy || remove.isPending) return;
    setDraft(alert);
    setThreshold(String(alert.thresholdMinutes));
  };
  return {
    alerts,
    isPending,
    isError,
    isFetching,
    refetch,
    pushStatus,
    runtimeError,
    draft,
    kind,
    selectKind,
    visibleAlerts,
    busy: busy || save.isPending || remove.isPending,
    pushWarning,
    threshold,
    setThreshold,
    setDraft,
    submit,
    toggle,
    removeAlert,
    reconnect,
    edit,
  };
}
