import { AlertKindSelector } from './alert-kind-selector';
import { BrandLogo } from '@/shared/ui/brand-logo';
import { AppHeader } from '@/shared/ui/app-header';
import { SymbolView } from 'expo-symbols';
import { openAlertTarget } from '@/features/bus-alert/model/open-alert-target';
import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useAppStore } from '@/shared/model/app-store';
import {
  ActivityIndicator,
  BackHandler,
  Image,
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
  returnToMap = false,
  returnToSubwaySelection = false,
  stackEditor = false,
}: {
  initialDraft: AlertDraft | null;
  returnToMap?: boolean;
  returnToSubwaySelection?: boolean;
  stackEditor?: boolean;
  initialTransport?: 'bus' | 'subway';
  initialKind?: AlertKind;
  initialSubwayDraft?: SubwayAlertDraft | null;
}) {
  const [adding, setAdding] = useState(false);
  const menu = useAppStore((s) => s.alertMenu);
  const setMenu = useAppStore((s) => s.setAlertMenu);
  const [transport, setTransport] = useState(initialTransport ?? menu.transport);
  const finishSetup = useCallback(() => {
    useAppStore.getState().finishAlertSelection();
    useAppStore.getState().setAlertReturnSelection(null);
    router.dismissTo({
      pathname: '/alerts',
      params: {
        requestId: String(Date.now()),
        returnTo: '',
        alertId: '',
        stationId: '',
        routeId: '',
        stationName: '',
        lineId: '',
      },
    });
  }, []);
  const bus = useAlertScreen(
    initialDraft,
    initialKind ?? menu.kind,
    stackEditor ? finishSetup : undefined,
  );
  const subway = useSubwayAlertScreen(
    initialSubwayDraft,
    initialKind ?? menu.kind,
    stackEditor ? finishSetup : undefined,
  );
  const kind = transport === 'bus' ? bus.kind : subway.kind;
  useEffect(() => setMenu({ transport, kind }), [transport, kind, setMenu]);
  const setBusDraft = bus.setDraft,
    setSubwayDraft = subway.setDraft;
  const closeEditor = useCallback(() => {
    if (stackEditor) {
      if (router.canGoBack()) router.back();
      else router.replace('/');
      return;
    }
    setAdding(false);
    if (transport === 'bus') setBusDraft(null);
    else setSubwayDraft(null);
    if (returnToSubwaySelection && transport === 'subway' && !subway.draft?.id) {
      const { alertReturnSelection, startAlertSelection, setAlertReturnSelection } =
        useAppStore.getState();
      if (alertReturnSelection?.resume) {
        setAlertReturnSelection(null);
        startAlertSelection({ ...alertReturnSelection, requestId: String(Date.now()) });
        router.setParams({ returnTo: '', requestId: '', stationName: '', lineId: '' });
        router.navigate('/');
        return;
      }
    }
    if (returnToMap) {
      router.setParams({
        returnTo: '',
        requestId: '',
        stationId: '',
        routeId: '',
        stationName: '',
        lineId: '',
      });
      router.navigate('/');
    }
  }, [
    transport,
    setBusDraft,
    setSubwayDraft,
    returnToMap,
    returnToSubwaySelection,
    stackEditor,
    subway.draft?.id,
  ]);
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        if (bus.busy || subway.busy) return true;
        if (!(transport === 'bus' ? bus.draft : subway.draft)) {
          if (adding) {
            setAdding(false);
            return true;
          }
          return false;
        }
        closeEditor();
        return true;
      });
      return () => listener.remove();
    }, [transport, bus.draft, subway.draft, bus.busy, subway.busy, closeEditor, adding]),
  );
  const editing = transport === 'bus' ? !!bus.draft : !!subway.draft;
  const busy = bus.busy || subway.busy;
  const hasAlerts =
    bus.alerts.some((alert) => !alert.monitoringSourceId) || (subway.list.data?.length ?? 0) > 0;
  if (!adding && !editing)
    return (
      <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 20,
          }}
        >
          <AppHeader
            title="TaraGo"
            titleVisual={<BrandLogo />}
            right={
              hasAlerts ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="예약 추가"
                  disabled={busy}
                  onPress={() => setAdding(true)}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <SymbolView
                    name={{ ios: 'plus', android: 'add' }}
                    size={25}
                    tintColor={colors.accent}
                  />
                </Pressable>
              ) : null
            }
          />
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          {!hasAlerts && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="버스 및 지하철 알림 추가"
              onPress={() => setAdding(true)}
              style={({ pressed }) => ({
                minHeight: 112,
                borderRadius: 16,
                borderWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.accentBorder,
                backgroundColor: pressed ? colors.strongSurface : colors.surface,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                paddingHorizontal: 20,
                paddingVertical: 16,
              })}
            >
              <Image
                source={require('@/assets/brand/tarago-mark.png')}
                accessible={false}
                style={{ width: 72, height: 72 }}
                resizeMode="contain"
              />
              <Text
                style={{
                  flex: 1,
                  fontSize: 16,
                  lineHeight: 25,
                  fontWeight: '600',
                  color: colors.text,
                  textAlign: 'left',
                }}
              >
                {'버스 및 지하철 알림을\n추가해주세요'}
              </Text>
              <SymbolView
                name={{ ios: 'plus', android: 'add' }}
                size={24}
                tintColor={colors.accent}
              />
            </Pressable>
          )}
          <BusAlertsPanel
            state={{
              ...bus,
              edit: (alert) => {
                setTransport('bus');
                bus.edit(alert);
              },
            }}
            all
          />
          <SubwayAlertsPanel
            state={{
              ...subway,
              edit: (alert) => {
                setTransport('subway');
                subway.edit(alert);
              },
            }}
            all
          />
        </ScrollView>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
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
          <AlertKindSelector
            value={kind}
            disabled={busy}
            onChange={(value) => {
              if (transport === 'bus') bus.selectKind(value);
              else subway.selectKind(value);
            }}
          />
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

function BusAlertsPanel({
  state,
  all = false,
}: {
  state: ReturnType<typeof useAlertScreen>;
  all?: boolean;
}) {
  const { draft, kind: selectedKind, busy } = state;
  const kind = selectedKind;
  const visibleAlerts = all
    ? state.alerts.filter((alert) => !alert.monitoringSourceId)
    : state.visibleAlerts;
  const warning =
    state.pushWarning ??
    (state.alerts.some((a) => a.enabled && (a.scheduledEnabled || a.proximityEnabled)) &&
    state.pushStatus?.ready === false
      ? '알림을 받으려면 알림 연결을 확인해주세요.'
      : null);
  return (
    <>
      {warning && (all || draft) && (
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
      ) : !all ? (
        <EmptyAlertCard transport="bus" kind={kind} disabled={busy} />
      ) : state.isPending ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : (
        <>
          {visibleAlerts.length > 0 &&
            visibleAlerts.map((alert) => {
              const kind = all ? (alert.scheduledEnabled ? 'time' : 'location') : selectedKind;
              return (
                <SavedAlertCard
                  key={alert.id}
                  compact={all}
                  title={`${alert.busNumber}번 버스`}
                  subtitle={alert.stop.name}
                  arrivals={<AlertArrivalTimes transport="bus" alert={alert} kind={kind} />}
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
              );
            })}
        </>
      )}
    </>
  );
}
