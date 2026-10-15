/** @fileoverview 지하철 알림 목록·편집·푸시 연결 UI. 초기 예약 초안은 라우트에서 전달받는다. */

import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AppButton, useAppTheme } from '@/shared/ui';
import { AlertTimeField } from '@/features/bus-alert/ui/alert-time-field';
import {
  ensureNotificationPermission,
  preparePush,
} from '@/features/bus-alert/model/alert-runtime';
import { usePushStatus } from '@/features/bus-alert/model/use-alerts';
import { useAppStore } from '@/shared/model/app-store';
import { useSubwayAlerts, useSubwayAlertMutations } from '../model/use-subway-alerts';
import { useSubwayArrivals } from '../model/use-subway-arrivals';
import type { SubwayAlert, SubwayAlertInput } from '../model/subway-alert';

type Draft = SubwayAlertInput & { id?: string };

/** 서버 요일 번호 0~6을 일요일부터 표시할 한국어 이름 목록이다. */
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 서버가 제공한 오류 문구를 우선하고 화면별 기본 안내로 보완한다.
 * @param error 잡힌 요청 오류.
 * @returns 사용자에게 표시할 문구.
 */
function message(error: unknown) {
  return isAxiosError(error) && typeof error.response?.data?.message === 'string'
    ? error.response.data.message
    : error instanceof Error
      ? error.message
      : '네트워크와 알림 권한을 확인해주세요.';
}

/**
 * 예약 목록과 편집 초안, 푸시 권한 준비 및 저장 오류 표시를 연결한다.
 * @param props.initial 최초 편집 초안. 없으면 예약 목록부터 표시한다.
 * @returns 예약 목록 또는 편집 UI. 로컬 상태를 읽는 핸들러에는 안정된 참조를 요구하는 소비자가 없어 메모화를 추가하지 않는다.
 */
export function SubwayAlertsContent({ initial }: { initial: Draft | null }) {
  /** 알림 화면의 색상과 제목·설명 글자 규칙을 공통 테마에서 읽는다. */
  const { colors, type } = useAppTheme();

  /** 역 선택 지도로 돌아가기 전에 숨겨진 지도 탭을 복원할 앱 스토어 액션이다. */
  const setMapTabHidden = useAppStore((state) => state.setMapTabHidden);

  /** 푸시 준비 후 다른 화면도 최신 연결 상태를 읽도록 Query 캐시를 무효화할 클라이언트다. */
  const client = useQueryClient();

  /** 목록 화면에 표시할 기기별 지하철 알림 Query다. */
  const list = useSubwayAlerts();

  /** 서버 예약 저장·삭제와 목록 캐시 동기화를 수행할 mutation 쌍이다. */
  const { save, remove } = useSubwayAlertMutations();

  /** 예약 알림을 받을 수 있는 현재 기기의 서버 푸시 연결 상태다. */
  const { data: pushStatus } = usePushStatus();

  /** 사용자가 편집 중인 예약 초안이다. null이면 저장된 예약 목록을 표시한다. */
  const [draft, setDraft] = useState<Draft | null>(initial);

  /** 숫자 입력 도중의 빈 값도 보존하는 도착 기준 분 문자열이다. 저장 시 숫자로 검증한다. */
  const [threshold, setThreshold] = useState(String(initial?.thresholdMinutes ?? 5));

  /** 권한 준비·예약 저장 작업이 끝날 때까지 중복 조작을 막는 표시 상태다. */
  const [busy, setBusy] = useState(false);

  /** 푸시 준비 결과로 받은 연결 경고 문구다. 예약 목록의 연결 상태 안내와 함께 표시한다. */
  const [warning, setWarning] = useState<string | null>(null);

  /** 초안의 역에 대한 실시간 도착 Query다. 초안이 없으면 빈 역 이름으로 비활성화한다. */
  const live = useSubwayArrivals(draft?.stationName ?? '');

  /** 예약 설정과 목록 항목에 공통으로 사용하는 카드 배경·간격이다. */
  const card = { backgroundColor: colors.surface, borderRadius: 16, padding: 18, gap: 14 } as const;

  /** 알림 화면의 설명 문구에 사용할 글자 크기·행간·보조색이다. */
  const help = { ...type.footnote, color: colors.secondaryText };

  /** 텍스트 동작에 공통으로 적용할 강조색과 최소 터치 높이다. */
  const link = { color: colors.accent, fontSize: 17, paddingVertical: 12, minHeight: 44 } as const;

  /** 지도 탭 숨김 상태를 해제하고 역을 고를 지도로 이동한다. */
  const map = () => {
    setMapTabHidden(false);
    router.navigate('/');
  };

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
  const persist = async (input: Draft) => {
    if (busy) return;
    setBusy(true);
    try {
      if (input.enabled) await prepare();
      await save.mutateAsync({ input, id: input.id });
      setDraft(null);
    } catch (error) {
      Alert.alert('알림을 저장하지 못했어요', message(error));
    } finally {
      setBusy(false);
    }
  };

  /** 반복 요일·시간·기준 분·알림 단계를 검증한 뒤 저장한다. 자정을 넘는 감시 시간은 허용한다. */
  const submit = () => {
    if (!draft) return;

    /** 입력 문자열을 저장 전 검증할 숫자 도착 기준 분으로 변환한 값이다. */
    const minutes = Number(threshold);

    /** 도착 기준 분을 넘지 않는 알림 단계만 남긴 저장 후보 목록이다. */
    const stages = (draft.notificationStages ?? [minutes, 3, 2, 1, 0]).filter((s) => s <= minutes);

    /** 00:00~23:59 범위의 HH:mm 입력인지 확인할 정규식이다. */
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (
      !time.test(draft.startTime) ||
      !time.test(draft.endTime) ||
      !draft.days.length ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 30 ||
      !stages.length ||
      draft.startTime === draft.endTime
    ) {
      Alert.alert(
        '설정을 확인해주세요',
        '반복 요일, 서로 다른 시작·종료 시간과 알림 단계를 선택해주세요. 도착 기준은 1~30분입니다.',
      );
      return;
    }
    void persist({ ...draft, thresholdMinutes: minutes, notificationStages: stages });
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
        onPress: () =>
          void remove
            .mutateAsync(alert.id)
            .catch((error) => Alert.alert('삭제하지 못했어요', message(error))),
      },
    ]);

  /**
   * 편집 화면에서 요일·알림 단계의 선택 상태를 일관되게 표시한다.
   * @param label 버튼 문구.
   * @param selected 선택 여부.
   * @param onPress 선택 변경 동작.
   * @param key 같은 그룹 내 식별자.
   */
  const choice = (label: string, selected: boolean, onPress: () => void, key: string | number) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={busy}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: 12,
        borderRadius: 12,
        backgroundColor: selected ? colors.accent : colors.secondarySurface,
      }}
    >
      <Text style={{ color: selected ? colors.onAccent : colors.text }}>{label}</Text>
    </Pressable>
  );
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {draft ? (
            <Pressable disabled={busy} onPress={() => setDraft(null)} accessibilityRole="button">
              <Text style={link}>목록</Text>
            </Pressable>
          ) : null}
          <Text accessibilityRole="header" style={{ ...type.title, color: colors.text, flex: 1 }}>
            지하철 알림
          </Text>
          <Pressable onPress={map} accessibilityRole="button">
            <Text style={link}>지도</Text>
          </Pressable>
        </View>
        <Text style={help}>선택한 역·노선·방향의 열차를 원하는 요일과 시간에 알려드려요.</Text>

        {warning || (list.data?.some((a) => a.enabled) && pushStatus?.ready === false) ? (
          <View style={{ ...card, backgroundColor: colors.warningSurface }}>
            <Text style={{ color: colors.warning }}>
              {warning ?? '예약 알림의 푸시 연결이 필요해요. 연결 전에는 알림을 받을 수 없어요.'}
            </Text>
            <Pressable
              disabled={busy}
              onPress={() => {
                setBusy(true);
                void prepare()
                  .catch((error) => Alert.alert('알림 연결 확인', message(error)))
                  .finally(() => setBusy(false));
              }}
            >
              <Text style={link}>푸시 다시 연결</Text>
            </Pressable>
            <Pressable onPress={() => void Linking.openSettings()}>
              <Text style={link}>기기 설정 열기</Text>
            </Pressable>
          </View>
        ) : null}
        {draft ? (
          <>
            <View style={{ ...card, backgroundColor: colors.accentSurface }}>
              <Text style={{ ...type.headline, color: colors.text }}>{draft.stationName}</Text>
              <Text style={{ ...type.headline, color: colors.accent }}>
                {draft.lineName ?? draft.lineId} · {draft.direction}
              </Text>
              <Text style={help}>같은 방향의 도착 예정 열차를 감시해요.</Text>
            </View>
            <View style={card}>
              <Text style={{ ...type.headline, color: colors.text }}>반복 요일</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {[1, 2, 3, 4, 5, 6, 0].map((day) =>
                  choice(
                    DAYS[day],
                    draft.days.includes(day),
                    () =>
                      setDraft({
                        ...draft,
                        days: draft.days.includes(day)
                          ? draft.days.filter((d) => d !== day)
                          : [...draft.days, day].sort(),
                      }),
                    day,
                  ),
                )}
              </View>
              <Text style={help}>감시 시간 · 한국 시간</Text>
              <AlertTimeField
                label="시작"
                value={draft.startTime}
                onChange={(startTime) => setDraft({ ...draft, startTime })}
              />
              <AlertTimeField
                label="종료"
                value={draft.endTime}
                onChange={(endTime) => setDraft({ ...draft, endTime })}
              />
              <Text style={help}>종료가 시작보다 이르면 다음 날까지 감시해요.</Text>
            </View>
            <View style={card}>
              <Text style={{ ...type.headline, color: colors.text }}>알림 시점</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[1, 3, 5, 10].map((value) =>
                  choice(
                    `${value}분 전`,
                    threshold === String(value),
                    () => {
                      setThreshold(String(value));
                      setDraft({
                        ...draft,
                        notificationStages: [...new Set([value, 3, 2, 1, 0])].filter(
                          (s) => s <= value,
                        ),
                      });
                    },
                    value,
                  ),
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TextInput
                  accessibilityLabel="도착 알림 기준 분"
                  value={threshold}
                  onChangeText={setThreshold}
                  keyboardType="number-pad"
                  maxLength={2}
                  style={{
                    color: colors.text,
                    backgroundColor: colors.secondarySurface,
                    borderRadius: 12,
                    padding: 12,
                    minWidth: 64,
                    fontSize: 18,
                  }}
                />
                <Text style={help}>분 전 · 1~30분</Text>
              </View>
              <Text style={help}>단계별 알림</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {[...new Set([Number(threshold), 3, 2, 1, 0])]
                  .filter((s) => Number.isInteger(s) && s >= 0 && s <= Number(threshold))
                  .map((stage) =>
                    choice(
                      stage === 0 ? '곧 도착' : `${stage}분`,
                      (draft.notificationStages ?? [5, 3, 2, 1, 0]).includes(stage),
                      () => {
                        /** 단계 버튼을 누르기 전의 선택 목록이다. 저장된 단계가 없으면 기본 단계를 사용해 해당 단계만 반전한다. */

                        const stages = draft.notificationStages ?? [5, 3, 2, 1, 0];
                        setDraft({
                          ...draft,
                          notificationStages: stages.includes(stage)
                            ? stages.filter((s) => s !== stage)
                            : [...stages, stage],
                        });
                      },
                      stage,
                    ),
                  )}
              </View>
              <Text style={help}>
                앱을 닫아도 예약 시간에 알려드려요. 앞 열차가 지나가면 다음 열차로 이어져요.
              </Text>
            </View>
            <View style={card}>
              <Text style={{ ...type.headline, color: colors.text }}>
                현재 도착정보 · 15초마다 갱신
              </Text>
              {live.isPending ? (
                <ActivityIndicator color={colors.accent} />
              ) : live.isError ? (
                <>
                  <Text style={{ color: colors.warning }}>도착정보를 불러오지 못했어요.</Text>
                  <Pressable onPress={() => void live.refetch()}>
                    <Text style={link}>다시 조회</Text>
                  </Pressable>
                </>
              ) : (
                live.data?.arrivals
                  .filter((a) => a.lineId === draft.lineId && a.direction === draft.direction)
                  .slice(0, 2)
                  .map((a) => (
                    <Text key={a.id} style={help}>
                      {a.destination}행 · {a.arrivalMessage || '시간 확인 중'}
                    </Text>
                  ))
              )}
              {live.data &&
              !live.data.arrivals.some(
                (a) => a.lineId === draft.lineId && a.direction === draft.direction,
              ) ? (
                <Text style={help}>현재 이 방향의 도착정보가 없습니다.</Text>
              ) : null}
            </View>
            <AppButton
              title={draft.id ? '변경 사항 저장' : '알림 저장'}
              loading={busy}
              onPress={submit}
            />
          </>
        ) : list.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : list.isError ? (
          <View style={card}>
            <Text style={{ color: colors.warning }}>알림 목록을 불러오지 못했어요.</Text>
            <Pressable onPress={() => void list.refetch()}>
              <Text style={link}>다시 시도</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {!list.data?.length ? (
              <View style={card}>
                <Text style={{ ...type.headline, color: colors.text }}>
                  아직 설정한 알림이 없어요
                </Text>
                <Text style={help}>
                  지도에서 지하철역을 고르고 도착정보의 알림 설정을 눌러주세요.
                </Text>
                <Pressable onPress={map}>
                  <Text style={link}>지도에서 역 선택하기</Text>
                </Pressable>
              </View>
            ) : (
              list.data.map((alert) => (
                <View key={alert.id} style={card}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ ...type.headline, color: colors.text }}>
                        {alert.stationName}
                      </Text>
                      <Text style={help}>
                        {alert.lineName ?? alert.lineId} · {alert.direction}
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel={`${alert.stationName} ${alert.direction} 알림 사용`}
                      value={alert.enabled}
                      disabled={busy || save.isPending || remove.isPending}
                      onValueChange={(enabled) => void persist({ ...alert, enabled })}
                      trackColor={{ true: colors.success }}
                    />
                  </View>
                  <Text style={help}>
                    {alert.days.map((day) => DAYS[day]).join(' · ')} {alert.startTime}–
                    {alert.endTime}
                  </Text>
                  <Text style={help}>
                    도착 {alert.thresholdMinutes}분 전 ·{' '}
                    {pushStatus?.ready ? '예약 감시' : '푸시 연결 필요'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 24 }}>
                    <Pressable
                      disabled={busy}
                      onPress={() => {
                        setDraft(alert);
                        setThreshold(String(alert.thresholdMinutes));
                      }}
                    >
                      <Text style={link}>수정</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy || remove.isPending}
                      onPress={() => deleteAlert(alert)}
                    >
                      <Text style={{ ...link, color: colors.danger }}>삭제</Text>
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
