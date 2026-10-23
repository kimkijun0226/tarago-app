import { openAlertTarget } from '@/features/bus-alert/model/open-alert-target';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAppStore } from '@/shared/model/app-store';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SubwayAlertsPanel } from '@/features/subway/ui/subway-alert-panel';
import {
  useSubwayAlertScreen,
  type SubwayAlertDraft,
} from '@/features/subway/model/use-subway-alert-screen';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WEEKDAYS, type AlertDraft, type AlertKind } from '../model/alert-form';
import { AlertArrivalTimes } from './alert-arrival-times';
import { useAlertScreen } from '../model/use-alert-screen';
import { AlertEditorForm } from './alert-editor-form';
import { createStyles } from './alert-screen-styles';
import { alertColors as colors } from './alert-design';
import {
  AlertNotice,
  AlertPageHeader,
  AlertPrimaryButton,
  SavedAlertCard,
  EmptyAlertCard,
} from './alert-components';

const styles = createStyles(colors);

/** 교통수단은 로컬 선택으로 전환하고 헤더·스크롤 컨테이너를 유지한다. */
export function AlertsScreenContent({
  initialDraft,
  initialTransport,
  initialKind,
  initialSubwayDraft = null,
}: {
  initialDraft: AlertDraft | null;
  initialTransport?: 'bus' | 'subway';
  initialKind?: AlertKind;
  initialSubwayDraft?: SubwayAlertDraft | null;
}) {
  const menu = useAppStore((s) => s.alertMenu);
  const setMenu = useAppStore((s) => s.setAlertMenu);
  const [transport, setTransport] = useState(initialTransport ?? menu.transport);
  const bus = useAlertScreen(initialDraft, initialKind ?? menu.kind);
  const subway = useSubwayAlertScreen(initialSubwayDraft, initialKind ?? menu.kind);
  const kind = transport === 'bus' ? bus.kind : subway.kind;
  useEffect(() => setMenu({ transport, kind }), [transport, kind, setMenu]);
  const setBusDraft = bus.setDraft,
    setSubwayDraft = subway.setDraft;
  const closeEditor = useCallback(() => {
    if (transport === 'bus') setBusDraft(null);
    else setSubwayDraft(null);
  }, [transport, setBusDraft, setSubwayDraft]);
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        if (bus.busy || subway.busy) return true;
        if (!(transport === 'bus' ? bus.draft : subway.draft)) return false;
        closeEditor();
        return true;
      });
      return () => listener.remove();
    }, [transport, bus.draft, subway.draft, bus.busy, subway.busy, closeEditor]),
  );
  const editing = transport === 'bus' ? !!bus.draft : !!subway.draft;
  const busy = bus.busy || subway.busy;
  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: 24, paddingTop: 20 }}>
        <AlertPageHeader
          transport={transport}
          kind={kind}
          onTransportChange={setTransport}
          editing={editing}
          busy={busy}
          onBack={closeEditor}
        />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!editing && (
          <View style={styles.segmented}>
            {(['time', 'location'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === value }}
                disabled={busy}
                onPress={() => {
                  if (transport === 'bus') bus.selectKind(value);
                  else subway.selectKind(value);
                }}
                style={({ pressed }) => [
                  styles.segment,
                  kind === value && styles.selectedSegment,
                  { transform: [{ translateY: pressed ? 2 : 0 }, { scale: pressed ? 0.98 : 1 }] },
                ]}
              >
                <Text style={[styles.segmentText, kind === value && styles.selectedSegmentText]}>
                  {value === 'time' ? '시간 알림' : '위치 알림'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
        {bus.runtimeError && (
          <AlertNotice action="기기 설정 열기" onAction={() => void Linking.openSettings()}>
            {bus.runtimeError}
          </AlertNotice>
        )}
        {transport === 'bus' ? (
          <BusAlertsPanel state={bus} />
        ) : (
          <SubwayAlertsPanel state={subway} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BusAlertsPanel({ state }: { state: ReturnType<typeof useAlertScreen> }) {
  const { draft, kind, busy } = state;
  const warning =
    state.pushWarning ??
    (state.alerts.some((a) => a.enabled && (a.scheduledEnabled || a.proximityEnabled)) &&
    state.pushStatus?.ready === false
      ? '알림을 받으려면 알림 연결을 확인해주세요.'
      : null);
  return (
    <>
      {warning && (
        <AlertNotice
          action="알림 다시 연결"
          disabled={busy}
          onAction={() => void state.reconnect()}
        >
          {warning}
        </AlertNotice>
      )}
      {draft ? (
        <>
          <AlertEditorForm
            draft={draft}
            setDraft={state.setDraft}
            kind={kind}
            threshold={state.threshold}
            setThreshold={state.setThreshold}
            disabled={busy}
          />
          <AlertPrimaryButton
            title={draft.id ? '변경 사항 저장' : '알림 저장'}
            busy={busy}
            onPress={() => void state.submit()}
          />
        </>
      ) : state.isPending ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : (
        <>
          {state.visibleAlerts.length > 0 &&
            state.visibleAlerts.map((alert) => (
              <SavedAlertCard
                key={alert.id}
                title={`${alert.busNumber}번 버스`}
                subtitle={alert.stop.name}
                arrivals={<AlertArrivalTimes transport="bus" alert={alert} />}
                summary={
                  kind === 'time'
                    ? `도착 ${alert.thresholdMinutes}분 전`
                    : `${alert.radius}m · ${alert.repeatMinutes ?? 5}분마다`
                }
                detail={`${alert.days.map((day) => WEEKDAYS[day]).join(' · ')}${kind === 'time' ? ` · ${alert.startTime}–${alert.endTime}${state.pushStatus?.ready === false ? ' · 알림 연결 필요' : ''}` : ''}${alert.scheduledEnabled && alert.proximityEnabled ? ' · 시간·위치 함께 사용' : ''}`}
                enabled={alert.enabled}
                busy={busy}
                onToggle={(value) => void state.toggle(alert, value)}
                onOpen={() =>
                  void openAlertTarget('bus', alert.id, `saved:${alert.id}:${Date.now()}`)
                }
                onEdit={() => state.edit(alert)}
                onDelete={() => state.removeAlert(alert)}
              />
            ))}
          <EmptyAlertCard
            transport="bus"
            kind={kind}
            compact={state.visibleAlerts.length > 0}
            disabled={busy}
          />
        </>
      )}
    </>
  );
}
