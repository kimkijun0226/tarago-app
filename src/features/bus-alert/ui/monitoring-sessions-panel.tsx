/** @fileoverview 접근 알림의 감시 제안과 현재 임시 감시의 남은 시간 및 시작·연장·중지 조작을 표시한다. */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { AppButton, AppSection, useAppTheme } from '@/shared/ui';
import type { BusAlert } from '../model/bus-alert';
import { useMonitoringSessions } from '../model/use-monitoring-sessions';

/** 반복 예약과 분리된 임시 감시 카드를 표시하고 시작·연장·중지를 처리한다. */
export function MonitoringSessionsPanel({
  sources,
  onDismiss,
}: {
  sources: BusAlert[];
  onDismiss: () => void;
}) {
  /** 현재 테마의 의미별 색상을 읽어 밝은 모드와 어두운 모드에 같은 화면 규칙을 적용한다. */
  const { colors } = useAppTheme();

  /** 진행 중인 임시 감시와 시작·연장·중지 함수를 서버 알림 훅에서 얻는다. */
  const { sessions, begin, extend, stop } = useMonitoringSessions();

  /** 카드의 남은 분을 계산할 로컬 시각이며 30초 타이머와 조작 성공 시 갱신한다. */
  const [now, setNow] = useState(() => Date.now());

  /** 진행 중인 비동기 조작을 화면에 반영하고 중복 입력을 막는 로컬 상태다. */
  const [busy, setBusy] = useState(false);

  /** 마운트한 패널의 남은 시간 표시를 30초마다 갱신한다. 외부 값을 캡처하지 않아 의존성은 없으며 정리 시 타이머를 해제한다. */
  useEffect(() => {
    /** 남은 시간 표시만 갱신하는 30초 타이머로 패널이 사라질 때 해제한다. */

    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  /** 중복 조작을 차단하고 성공 후 접근 제안을 닫는다. 실패는 사용자에게 표시한다. */
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setNow(Date.now());
      onDismiss();
    } catch (e) {
      Alert.alert('임시 감시 설정', e instanceof Error ? e.message : '서버 연결을 확인해주세요.');
    } finally {
      setBusy(false);
    }
  }
  if (!sources.length && !sessions.length) return null;
  return (
    <View style={{ gap: 12 }}>
      {sources.length > 0 && (
        <AppSection title="정류소 접근 알림">
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
            {sources[0].stop.name} 정류소 근처입니다
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 22, color: colors.secondaryText }}>
            {sources.map((source) => `${source.busNumber}번`).join(', ')} 버스 실시간 도착 알림을
            지금부터 1시간 동안 시작할까요?
          </Text>
          <AppButton
            disabled={busy}
            title="1시간 실시간 알림 시작"
            onPress={() =>
              void run(async () => {
                for (const source of sources) await begin(source);
              })
            }
          />
          <AppButton
            disabled={busy}
            variant="secondary"
            title="지금은 안 할게요"
            onPress={onDismiss}
          />
        </AppSection>
      )}
      {sessions.map((session) => {
        // 현재 시각마다 달라지는 단순 분 계산은 캐시 없이 카드 렌더에서 계산한다.
        /** 만료 시각까지 남은 분을 올림하고 음수는 0으로 제한한 표시 값이다. */
        const left = Math.max(0, Math.ceil((Date.parse(session.monitoringEndsAt!) - now) / 60_000));
        return (
          <AppSection key={session.id} title="임시 버스 감시">
            <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text }}>
              {session.busNumber}번 · {session.stop.name}
            </Text>
            <Text style={{ color: colors.success, fontSize: 15, lineHeight: 22 }}>
              {left ? `${left}분 남음 · 임시 감시 중` : '감시 종료 · 연장 응답 대기'}
            </Text>
            <AppButton
              disabled={busy}
              variant="secondary"
              title="지금부터 1시간 연장"
              onPress={() => void run(() => extend(session))}
            />
            <AppButton
              disabled={busy}
              variant="destructive"
              title="감시 끄기"
              onPress={() => void run(() => stop(session))}
            />
          </AppSection>
        );
      })}
      {busy && <ActivityIndicator color={colors.accent} />}
    </View>
  );
}
