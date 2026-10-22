import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAppStore } from '@/shared/model/app-store';
import type { SubwayAlert } from '@/features/subway/model/subway-alert';
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
import type { BusAlert } from '../model/bus-alert';
import { WEEKDAYS, type AlertDraft, type AlertKind } from '../model/alert-form';
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
import { MonitoringSessionsPanel } from './monitoring-sessions-panel';

const styles = createStyles(colors);

/** 교통수단은 로컬 선택으로 전환하고 헤더·스크롤 컨테이너를 유지한다. */
export function AlertsScreenContent({
  initialDraft,
  sources,
  initialTransport,
  initialKind,
  subwaySources = [],
  initialSubwayDraft = null,
}: {
  initialDraft: AlertDraft | null;
  sources: BusAlert[];
  initialTransport?: 'bus' | 'subway';
  initialKind?: AlertKind;
  subwaySources?: SubwayAlert[];
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
          onRefresh={() => {
            if (transport === 'bus') void bus.refetch({ cancelRefetch: false });
            else void subway.list.refetch({ cancelRefetch: false });
          }}
          refreshing={transport === 'bus' ? bus.isFetching : subway.list.isFetching}
          refreshFailed={transport === 'bus' ? bus.isError : subway.list.isError}
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
          <BusAlertsPanel state={bus} sources={sources} />
        ) : (
          <SubwayAlertsPanel state={subway} sources={subwaySources} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BusAlertsPanel({
  state,
  sources,
}: {
  state: ReturnType<typeof useAlertScreen>;
  sources: BusAlert[];
}) {
  const { draft, kind, busy } = state;
  const warning =
    state.pushWarning ??
    (state.alerts.some((a) => a.enabled && a.scheduledEnabled) && state.pushStatus?.ready === false
      ? '시간 알림을 받으려면 알림 연결을 확인해주세요.'
      : null);
  return (
    <>
      <MonitoringSessionsPanel
        sources={state.dismissedSource ? [] : sources}
        onDismiss={() => state.setDismissedSource(true)}
      />
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
                summary={
                  kind === 'time'
                    ? `도착 ${alert.thresholdMinutes}분 전`
                    : `정류소 ${alert.radius}m 이내`
                }
                detail={`${alert.days.map((day) => WEEKDAYS[day]).join(' · ')}${kind === 'time' ? ` · ${alert.startTime}–${alert.endTime}${state.pushStatus?.ready === false ? ' · 알림 연결 필요' : ''}` : ' · 접근 시 1시간 감시 시작 확인'}${alert.scheduledEnabled && alert.proximityEnabled ? ' · 시간·위치 함께 사용' : ''}`}
                enabled={alert.enabled}
                busy={busy}
                onToggle={(value) => void state.toggle(alert, value)}
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
