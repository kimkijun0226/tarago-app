import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { AlertIconButton, AlertPrimaryButton } from '@/features/bus-alert/ui/alert-components';
import { createStyles } from '@/features/bus-alert/ui/alert-screen-styles';
import { alertColors as colors } from '@/features/bus-alert/ui/alert-design';
import { alertErrorMessage } from '@/features/bus-alert/model/alert-form';
import { useSubwayMonitoringSessions } from '../model/use-subway-monitoring-sessions';
import { subwayAlertSubtitle } from '../model/subway-direction';
import type { SubwayAlert } from '../model/subway-alert';
const styles = createStyles(colors);

/** 반복 위치 설정과 일회성 감시를 구분하고 사용자 동의로 감시를 시작한다. */
export function SubwayMonitoringPanel({ sources }: { sources: SubwayAlert[] }) {
  const { sessions, begin, extend, stop } = useSubwayMonitoringSessions();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  async function run(action: () => Promise<unknown>) {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    try {
      await action();
      setDismissed(true);
      setNow(Date.now());
    } catch (error) {
      Alert.alert('지하철 도착 알림', alertErrorMessage(error));
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  if (!sessions.length && (!sources.length || dismissed)) return null;
  return (
    <View style={{ gap: 12 }}>
      {!dismissed && sources.length > 0 && (
        <View style={styles.card}>
          <View style={styles.heading}>
            <Text style={{ ...styles.sectionTitle, flex: 1 }}>{sources[0].stationName}</Text>
            <AlertIconButton
              name={{ ios: 'xmark', android: 'close' }}
              label="감시 제안 닫기"
              disabled={busy}
              onPress={() => setDismissed(true)}
            />
          </View>
          <AlertPrimaryButton
            title="1시간 도착 알림 시작"
            busy={busy}
            onPress={() =>
              void run(async () => {
                for (const source of sources) await begin(source);
              })
            }
          />
        </View>
      )}
      {sessions.map((session) => {
        const left = Math.max(
          0,
          Math.ceil((Date.parse(session.monitoringEndsAt ?? '') - now) / 60_000),
        );
        return (
          <View key={session.id} style={styles.card}>
            <Text style={styles.stationName}>
              {session.stationName} · {subwayAlertSubtitle(session)}
            </Text>
            <Text style={styles.help}>{left ? `${left}분 남음` : '감시 종료'}</Text>
            <View style={styles.heading}>
              <AlertIconButton
                name={{ ios: 'arrow.clockwise', android: 'refresh' }}
                label="지금부터 1시간 연장"
                disabled={busy}
                onPress={() => void run(() => extend(session))}
              />
              <AlertIconButton
                name={{ ios: 'stop.fill', android: 'stop' }}
                label="감시 중지"
                disabled={busy}
                onPress={() => void run(() => stop(session))}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
