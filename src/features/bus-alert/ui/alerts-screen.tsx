/** @fileoverview 버스 알림의 목록·편집 UI와 권한 확인·저장 흐름. 초기 초안은 라우트에서 전달받는다. */
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';
import { useAppStore } from '@/shared/model/app-store';
import { useAlerts, useAlertMutations, usePushStatus } from '../model/use-alerts';
import {
  ensureNotificationPermission,
  ensureProximityPermission,
  preparePush,
} from '../model/alert-runtime';
import type { BusAlert, BusAlertInput } from '../model/bus-alert';
import { AlertEditorForm, type AlertDraft } from './alert-editor-form';
import { createStyles } from './alert-screen-styles';
import { MonitoringSessionsPanel } from './monitoring-sessions-panel';
import { AppButton, useAppTheme } from '@/shared/ui';

/** 서버의 일요일 0 기준 요일 번호를 한국어 표시명으로 바꾼다. */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 목록과 로컬 초안을 관리하며 저장 전에 권한과 입력을 검증한다. */
export function AlertsScreenContent({
  initialDraft,
  sources,
}: {
  initialDraft: AlertDraft | null;
  sources: BusAlert[];
}) {
  /** 현재 테마의 의미별 색상을 읽어 밝은 모드와 어두운 모드에 같은 화면 규칙을 적용한다. */
  const { colors } = useAppTheme();

  /** 테마가 같으면 스타일 계산 결과를 재사용한다. */
  const styles = useMemo(() => createStyles(colors), [colors]);

  /** 지도 이동 전에 지도 탭의 숨김 상태를 해제한다. */
  const setMapTabHidden = useAppStore((state) => state.setMapTabHidden);

  /** 현재 기기에 저장된 서버 알림 목록으로, 필터와 감시 설정의 원본이다. */
  const { data: alerts = [], isPending, isError, refetch } = useAlerts();

  /** 예약 알림 경고와 목록의 감시 상태 표시에 사용할 서버 푸시 준비 상태다. */
  const { data: pushStatus } = usePushStatus();

  /** 목록의 저장·삭제 진행 상태와 서버 변이를 제공한다. */
  const { save, remove } = useAlertMutations();

  /** 권한 준비 및 복합 설정 분리와 순서를 맞춰 기다릴 수 있는 저장 함수다. */
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
  const [kind, setKind] = useState<'time' | 'location'>(
    initialDraft?.proximityEnabled && !initialDraft.scheduledEnabled ? 'location' : 'time',
  );

  /** 접근 제안을 거절하거나 감시를 시작한 뒤 이번 화면에서 해당 제안을 숨기는 상태다. */
  const [dismissedSource, setDismissedSource] = useState(false);

  // 목록 필터는 현재 방식에 따른 단순 파생 값이다. 별도 캐시 없이 서버 데이터에서 바로 계산한다.
  /** 일회성 감시를 제외하고 현재 선택 방식에 해당하는 반복 설정만 남긴다. */
  const visibleAlerts = alerts.filter(
    (a) => !a.monitoringSourceId && (kind === 'time' ? a.scheduledEnabled : a.proximityEnabled),
  );

  /** 진행 중인 비동기 조작을 화면에 반영하고 중복 입력을 막는 로컬 상태다. */
  const [busy, setBusy] = useState(false);

  /** 푸시 준비 실패 사유를 저장해 서버 상태 갱신 전에도 연결 안내를 표시한다. */
  const [pushWarning, setPushWarning] = useState<string | null>(null);

  /** 직접 입력 중 빈 값 등도 표현할 수 있도록 분 기준을 문자열로 보관하는 폼 상태다. */
  const [threshold, setThreshold] = useState(String(initialDraft?.thresholdMinutes ?? 5));

  /** 알림 방식을 바꾸면 다른 방식의 기존 레코드를 덮어쓰지 않도록 초안 ID를 분리한다. 렌더의 kind를 읽으므로 일반 함수로 둔다. */
  const selectKind = (value: 'time' | 'location') => {
    setKind(value);
    setDraft(
      (current) =>
        current && {
          ...current,
          // 방식이 다른 기존 설정은 그대로 두고 새 설정을 만든다.
          id: value === kind ? current.id : undefined,
          scheduledEnabled: value === 'time',
          proximityEnabled: value === 'location',
          monitoringStartedAt: undefined,
          monitoringEndsAt: undefined,
          monitoringSourceId: undefined,
        },
    );
  };

  /** 활성 알림의 권한과 예약 푸시를 준비한다. 저장·토글 콜백이 공유하므로 client 기준으로 참조를 유지한다. */
  const prepare = useCallback(
    async (input: BusAlertInput) => {
      if (!input.enabled) return;
      await ensureNotificationPermission();
      if (input.proximityEnabled) await ensureProximityPermission();
      if (input.scheduledEnabled) {
        setPushWarning(await preparePush());
        await client.invalidateQueries({ queryKey: ['alerts', 'push-status'] });
      }
    },
    [client],
  );

  /** 입력과 알림 단계를 검증한 뒤 다른 방식의 기존 설정을 보존하며 저장한다. 최신 초안·처리 상태가 바뀌면 콜백도 갱신한다. */
  const submit = useCallback(async () => {
    if (!draft || busy) return;

    /** 24시간 HH:mm 형식만 허용하기 위한 저장 경계의 검증 규칙이다. */
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;

    /** 문자열 분 입력을 숫자로 바꿔 1~30 정수 범위와 알림 단계 상한을 검증한다. */
    const minutes = Number(threshold);
    if (
      !time.test(draft.startTime) ||
      !time.test(draft.endTime) ||
      draft.startTime === draft.endTime ||
      !draft.days.length ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 30 ||
      (!draft.scheduledEnabled && !draft.proximityEnabled)
    ) {
      Alert.alert(
        '설정을 확인해주세요',
        '시간은 08:30 형식으로 입력하고, 요일과 알림 방식을 선택해주세요. 도착 기준은 1~30분입니다.',
      );
      return;
    }
    setBusy(true);
    try {
      /** 기존 단계 선택을 우선하고 없는 초안에는 기본 알림 단계를 적용한다. */
      const stages = draft.notificationStages ?? [Number(threshold), 3, 2, 1, 0];

      /** 중복을 제거하고 도착 기준 분보다 이른 단계만 서버 입력에 남긴다. */
      const notificationStages = [...new Set(stages)].filter((stage) => stage <= minutes);
      if (draft.scheduledEnabled && !notificationStages.length) {
        Alert.alert('알림 단계를 선택해주세요', '최소 한 개의 알림 시점을 선택해주세요.');
        return;
      }

      /** 현재 방식과 검증된 기준 분·단계를 반영한 서버 저장 입력이다. */
      const input = {
        ...draft,
        scheduledEnabled: kind === 'time',
        proximityEnabled: kind === 'location',
        thresholdMinutes: minutes,
        notificationStages: notificationStages.length ? notificationStages : [minutes],
      };
      // 기존 복합 설정을 편집할 때 다른 방식의 설정을 별도 레코드로 보존한다.
      if (draft.id && draft.scheduledEnabled && draft.proximityEnabled) {
        await saveAsync({
          input: {
            ...draft,
            scheduledEnabled: kind !== 'time',
            proximityEnabled: kind !== 'location',
          },
        });
      }
      await prepare(input);
      await saveAsync({ input, id: draft.id });
      setDraft(null);
    } catch (error) {
      Alert.alert('알림을 저장하지 못했어요', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [draft, busy, threshold, prepare, saveAsync, kind]);

  /** 알림 활성화 전 필요한 권한을 확인하고 서버에 반영한다. 준비·저장 함수가 같으면 참조를 유지한다. */
  const toggle = useCallback(
    async (alert: BusAlert, value: boolean) => {
      setBusy(true);
      try {
        /** 현재 방식과 검증된 기준 분·단계를 반영한 서버 저장 입력이다. */

        const input = { ...alert, enabled: value };
        await prepare(input);
        await saveAsync({ input, id: alert.id });
      } catch (error) {
        Alert.alert('알림을 변경하지 못했어요', errorMessage(error));
      } finally {
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
            void removeAsync(alert.id).catch((error) =>
              Alert.alert('삭제하지 못했어요', errorMessage(error)),
            );
          },
        },
      ]);
    },
    [removeAsync],
  );

  /** 기기 알림 권한과 푸시 등록을 다시 확인하고 서버 준비 상태를 새로 조회한다. client 기준으로 참조를 유지한다. */
  const reconnect = useCallback(async () => {
    setBusy(true);
    try {
      await ensureNotificationPermission();
      setPushWarning(await preparePush());
      await client.invalidateQueries({ queryKey: ['alerts', 'push-status'] });
    } catch (error) {
      Alert.alert('알림 연결 확인', errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [client]);

  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          {draft ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="알림 목록으로 돌아가기"
              onPress={() => setDraft(null)}
              style={styles.iconButton}
            >
              <SymbolView
                name={{ ios: 'chevron.left', android: 'arrow_back' }}
                size={22}
                tintColor={colors.accent}
              />
            </Pressable>
          ) : null}
          <Text accessibilityRole="header" style={styles.title}>
            {draft ? '알림 설정' : '버스 알림'}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMapTabHidden(false);
              router.navigate('/');
            }}
          >
            <Text style={styles.link}>지도</Text>
          </Pressable>
        </View>
        <Text style={styles.help}>
          원하는 시간에, 정류소 가까이에서. 버스를 놓치지 않도록 알려드려요.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/subway-alerts')}>
          <Text style={styles.link}>지하철 알림</Text>
        </Pressable>
        <MonitoringSessionsPanel
          sources={dismissedSource ? [] : sources}
          onDismiss={() => setDismissedSource(true)}
        />
        <View style={styles.segmented}>
          {(['time', 'location'] as const).map((value) => (
            <Pressable
              key={value}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === value }}
              onPress={() => selectKind(value)}
              style={[styles.segment, kind === value && styles.selectedSegment]}
            >
              <Text style={[styles.segmentText, kind === value && styles.selectedSegmentText]}>
                {value === 'time' ? '시간' : '위치'}
              </Text>
            </Pressable>
          ))}
        </View>
        {runtimeError ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>{runtimeError}</Text>
            <Pressable onPress={() => void Linking.openSettings()}>
              <Text style={styles.link}>기기 설정 열기</Text>
            </Pressable>
          </View>
        ) : null}
        {pushWarning ||
        (alerts.some((a) => a.enabled && a.scheduledEnabled) && pushStatus?.ready === false) ? (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              {pushWarning ??
                (pushStatus?.error
                  ? '서버의 푸시 자격 증명을 확인해주세요. 예약 알림이 중지되어 있어요.'
                  : '예약 알림의 푸시 연결이 필요해요. 접근 알림은 별도로 동작합니다.')}
            </Text>
            <Pressable disabled={busy} onPress={() => void reconnect()}>
              <Text style={styles.link}>푸시 다시 연결</Text>
            </Pressable>
          </View>
        ) : null}

        {draft ? (
          <>
            <AlertEditorForm
              draft={draft}
              setDraft={setDraft}
              kind={kind}
              threshold={threshold}
              setThreshold={setThreshold}
            />
            <AppButton
              title={draft.id ? '변경 사항 저장' : '알림 저장'}
              loading={busy}
              onPress={() => void submit()}
            />
          </>
        ) : (
          <>
            {isPending ? (
              <ActivityIndicator style={styles.loading} color={colors.accent} />
            ) : isError ? (
              <View style={styles.card}>
                <Text style={styles.warningText}>
                  알림 목록을 불러오지 못했어요. 서버 연결을 확인해주세요.
                </Text>
                <Pressable onPress={() => void refetch()}>
                  <Text style={styles.link}>다시 시도</Text>
                </Pressable>
              </View>
            ) : !visibleAlerts.length ? (
              <View style={styles.empty}>
                <SymbolView
                  name={{ ios: 'bell', android: 'notifications' }}
                  size={42}
                  tintColor={colors.accent}
                />
                <Text style={styles.stationName}>아직 설정한 알림이 없어요</Text>
                <Text style={styles.help}>
                  지도에서 정류소를 고르고 버스 시간 오른쪽의 종 버튼을 눌러주세요.
                </Text>
                <Pressable
                  onPress={() => {
                    setMapTabHidden(false);
                    router.navigate('/');
                  }}
                >
                  <Text style={styles.link}>지도에서 버스 선택하기</Text>
                </Pressable>
              </View>
            ) : (
              visibleAlerts.map((alert) => (
                <View key={alert.id} style={[styles.card, !alert.enabled && styles.dim]}>
                  <View style={styles.heading}>
                    <View style={styles.flex}>
                      <Text style={styles.stationName}>{alert.stop.name}</Text>
                      <Text style={styles.busNumber}>{alert.busNumber}번 버스</Text>
                    </View>
                    <Switch
                      accessibilityLabel={`${alert.busNumber}번 알림 사용`}
                      disabled={busy || save.isPending || remove.isPending}
                      value={alert.enabled}
                      onValueChange={(value) => void toggle(alert, value)}
                      trackColor={{ true: colors.success }}
                    />
                  </View>
                  {kind === 'time' ? (
                    <>
                      <Text style={styles.detail}>
                        {alert.days.map((day) => WEEKDAYS[day]).join(' · ')} {alert.startTime}–
                        {alert.endTime}
                      </Text>
                      <Text style={styles.detail}>
                        도착 {alert.thresholdMinutes}분 전 ·{' '}
                        {pushStatus?.ready ? '예약 감시' : '푸시 연결 필요'}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.detail}>
                      {alert.days.map((day) => WEEKDAYS[day]).join(' · ')} · 정류소 {alert.radius}m
                      접근 시 감시 시작 확인
                    </Text>
                  )}
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => {
                        setDraft(alert);
                        setThreshold(String(alert.thresholdMinutes));
                      }}
                    >
                      <Text style={styles.link}>수정</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={remove.isPending || busy}
                      onPress={() => removeAlert(alert)}
                    >
                      <Text style={styles.deleteText}>삭제</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** 서버의 사용자용 메시지를 우선하고 없으면 일반 오류 또는 연결 안내를 반환한다. */
function errorMessage(error: unknown) {
  /** 알 수 없는 오류에서 서버 응답 메시지 경로만 안전하게 확인하기 위한 좁은 구조다. */
  const response = error as { response?: { data?: { message?: unknown } } };

  /** 서버가 제공한 안내 문구이며 문자열일 때만 사용자에게 표시한다. */
  const message = response.response?.data?.message;
  return typeof message === 'string'
    ? message
    : error instanceof Error
      ? error.message
      : '네트워크와 권한 설정을 확인해주세요.';
}
