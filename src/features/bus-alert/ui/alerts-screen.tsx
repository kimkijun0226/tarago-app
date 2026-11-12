import { EdgeBack } from '@/shared/ui/edge-back';
import { ArrivalTimeRefresh } from '@/shared/ui/arrival-time-entrance';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { normalizeBusStopNumber } from '@/features/bus-stop/model/bus-stop-number';
import type { BusAlert } from '../model/bus-alert';
import { EditableAlertList } from '@/features/bus-alert/ui/editable-alert-list';
import { isArrivalRefreshQuery, waitForForegroundRefresh } from '@/shared/api/foreground-refresh';
import { ListSkeleton } from '@/shared/ui/loading-skeleton';
import { TransportSelector } from '@/shared/ui/transport-selector';
import { AlertKindSelector } from './alert-kind-selector';
import { BrandLogo } from '@/shared/ui/brand-logo';
import { AppHeader } from '@/shared/ui/app-header';
import Animated, { Easing, ReduceMotion, useAnimatedRef, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/shared/model/app-store';
import { ActivityIndicator, BackHandler, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SubwayAlertsPanel } from '@/features/subway/ui/subway-alert-panel';
import {
  useSubwayAlertScreen,
  type SubwayAlertDraft,
} from '@/features/subway/model/use-subway-alert-screen';
import { SafeAreaView } from 'react-native-screens/experimental';
import { WEEKDAYS, type AlertDraft, type AlertKind } from '../model/alert-form';
import { AlertArrivalTimes, AlertTodayControl } from './alert-arrival-times';
import { useAlertScreen } from '../model/use-alert-screen';
import { AlertEditorForm } from './alert-editor-form';
import { createStyles } from './alert-screen-styles';
import { alertColors as colors } from './alert-design';
import {
  AlertNotice,
  AlertPageHeader,
  AlertPrimaryButton,
  SavedAlertCard,
  SavedAlertSecondaryText,
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
  const editorScroll = useRef<ScrollView>(null);
  const editorContent = useRef({ editing: false, height: 0 });
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
    transport === 'bus'
      ? bus.alerts.some((alert) => !alert.monitoringSourceId)
      : (subway.list.data?.length ?? 0) > 0;
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refreshHeight = useSharedValue(0);
  const refreshSpace = useAnimatedStyle(() => ({ height: refreshHeight.get() }));
  const scrollRef = useAnimatedRef<ScrollView>();
  const [dismissVersion, setDismissVersion] = useState(0);
  const alertDragActive = useRef(false);
  const onDragActive = useCallback((active: boolean) => { alertDragActive.current = active; }, []);
  const refresh = async () => {
    if (refreshing || alertDragActive.current) return;
    const startedAt = Date.now();
    setRefreshing(true);
    refreshHeight.set(44);
    try {
      await waitForForegroundRefresh(Promise.allSettled([
        bus.refetch({ cancelRefetch: false }),
        subway.list.refetch({ cancelRefetch: false }),
        client.refetchQueries({
          type: 'active',
          predicate: isArrivalRefreshQuery,
      }, { cancelRefetch: false }),
      ]));
    } finally {
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - startedAt))));
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      refreshHeight.set(withTiming(0, {
        duration: 220,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }));
      setRefreshing(false);
    }
  };
  const listPending = transport === 'bus' ? bus.isPending : subway.list.isPending;
  const listError = transport === 'bus' ? bus.isError : subway.list.isError;
  const editorVisible = adding || editing;
  const list = (
    <View
      style={styles.flex}
      pointerEvents={editorVisible ? 'none' : 'auto'}
      accessibilityElementsHidden={editorVisible}
      importantForAccessibility={editorVisible ? 'no-hide-descendants' : 'auto'}
    >
      <SafeAreaView
        style={styles.page}
        onTouchStart={() => {
          if (!alertDragActive.current) setDismissVersion((version) => version + 1);
        }}
        edges={{ top: true, left: true, right: true, bottom: true }}
      >
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 0,
          }}
        >
          <AppHeader
            title="TaraGo"
            titleVisual={<BrandLogo />}
            right={
              hasAlerts ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${transport === 'bus' ? '버스' : '지하철'} 알림 생성`}
                  disabled={busy}
                  onPress={() => { setDismissVersion((version) => version + 1); setAdding(true); }}
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
        <Animated.View style={[{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, refreshSpace]}>
          {refreshing && <ActivityIndicator color={colors.accent} accessibilityLabel="새로고침 중" />}
        </Animated.View>
        <ArrivalTimeRefresh refreshing={refreshing}>
      <Animated.ScrollView
          ref={scrollRef}
          style={styles.flex}
          alwaysBounceVertical
          bounces
          scrollEnabled={!refreshing}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => void refresh()}
              tintColor="transparent"
              colors={['transparent']}
              progressBackgroundColor="transparent"
            />
          }
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[styles.content, { flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <TransportSelector value={transport} onChange={setTransport} disabled={busy} />
          {listError && !hasAlerts && (
            <Pressable
              accessibilityRole="button"
              onPress={() => void (transport === 'bus' ? bus.refetch() : subway.list.refetch())}
            >
              <Text style={{ color: colors.danger, lineHeight: 22 }}>
                알림 목록을 불러오지 못했어요. 눌러서 다시 시도해주세요.
              </Text>
            </Pressable>
          )}
          {!hasAlerts && !listPending && !listError && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${transport === 'bus' ? '버스' : '지하철'} 알림 생성`}
              onPress={() => { setDismissVersion((version) => version + 1); setAdding(true); }}
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
                paddingHorizontal: 16,
                paddingVertical: 16,
              })}
            >
              <Image
                source={require('@/assets/brand/tarago-mark.png')}
                accessible={false}
                style={{ width: 48, height: 48 }}
                resizeMode="contain"
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                style={{
                  flex: 1,
                  fontSize: 16,
                  lineHeight: 25,
                  fontWeight: '600',
                  color: colors.text,
                  textAlign: 'left',
                }}
              >
                {`${transport === 'bus' ? '버스' : '지하철'} 알림을 추가해주세요`}
              </Text>
              <SymbolView
                name={{ ios: 'plus', android: 'add' }}
                size={24}
                tintColor={colors.accent}
              />
            </Pressable>
          )}
          {transport === 'bus' ? (
            <BusAlertsPanel
              state={{
                ...bus,
                draft: null,
                edit: (alert) => {
                  setTransport('bus');
                  bus.edit(alert);
                },
              }}
              all
              scrollableRef={scrollRef}
              onDragActive={onDragActive}
              dismissVersion={dismissVersion}
            />
          ) : (
            <SubwayAlertsPanel
              state={{
                ...subway,
                draft: null,
                edit: (alert) => {
                  setTransport('subway');
                  subway.edit(alert);
                },
              }}
              all
              scrollableRef={scrollRef}
              onDragActive={onDragActive}
              dismissVersion={dismissVersion}
            />
          )}
        </Animated.ScrollView>
      </ArrivalTimeRefresh>
      </SafeAreaView>
    </View>
  );
  const editor = (
    <EdgeBack enabled={!stackEditor && !busy} onBack={closeEditor} revealBehind={!stackEditor}>
    <SafeAreaView style={styles.page} edges={{ top: true, left: true, right: true, bottom: true }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 0 }}>
        <AlertPageHeader
          transport={transport}
          kind={kind}
          editing={editing}
          busy={busy}
          onBack={closeEditor}
          onDelete={
            transport === 'bus'
              ? bus.draft?.id
                ? () => {
                    const alert = bus.alerts.find((item) => item.id === bus.draft?.id);
                    if (alert) bus.removeAlert(alert);
                  }
                : undefined
              : subway.draft?.id
                ? () => {
                    const alert = subway.list.data?.find((item) => item.id === subway.draft?.id);
                    if (alert) subway.deleteAlert(alert);
                  }
                : undefined
          }
        />
      </View>
      <ScrollView
        ref={editorScroll}
        onContentSizeChange={(_, height) => {
          const previous = editorContent.current;
          editorContent.current = { editing, height };
          // 새 질문이 추가될 때만 이동하고 입력·선택 스타일 변경은 스크롤을 건드리지 않는다.
          if (editing && previous.editing && height > previous.height + 48) {
            requestAnimationFrame(() => editorScroll.current?.scrollToEnd({ animated: true }));
          }
        }}
        style={styles.flex}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[styles.content, !editing && { flexGrow: 1 }]}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {!editing ? (
          <AlertKindSelector
            transport={transport}
            disabled={busy}
            onChange={(value) => {
              if (transport === 'bus') bus.selectKind(value);
              else subway.selectKind(value);
            }}
          />
        ) : transport === 'bus' ? (
          <BusAlertsPanel state={bus} />
        ) : (
          <SubwayAlertsPanel state={subway} />
        )}
      </ScrollView>
    </SafeAreaView>
    </EdgeBack>
  );
  if (stackEditor) return editorVisible ? editor : list;
  return (
    <View style={styles.flex}>
      {list}
      {editorVisible && <View style={[StyleSheet.absoluteFill, { zIndex: 1 }]}>{editor}</View>}
    </View>
  );
}

function BusAlertsPanel({
  state,
  all = false,
  scrollableRef,
  onDragActive,
  dismissVersion,
}: {
  state: ReturnType<typeof useAlertScreen>;
  all?: boolean;
  scrollableRef?: import('react-native-reanimated').AnimatedRef<ScrollView>;
  onDragActive?: (active: boolean) => void;
  dismissVersion?: number;
}) {
  const { draft, kind: selectedKind, busy } = state;
  const kind = selectedKind;
  const publicAlerts = useMemo(
    () => state.alerts.filter((alert) => !alert.monitoringSourceId),
    [state.alerts],
  );
  const visibleAlerts = all ? publicAlerts : state.visibleAlerts;
  const hasActiveAlerts = state.alerts.some(
    (a) => a.enabled && (a.scheduledEnabled || a.proximityEnabled),
  );
  const warning = hasActiveAlerts
    ? (state.pushWarning ??
      (state.pushStatus?.ready === false ? '알림을 받으려면 알림 연결을 확인해주세요.' : null))
    : null;
  return (
    <>
      {(all || draft) && (
        <AlertNotice
          source="bus-push"
          action="알림 다시 연결"
          disabled={busy}
          onAction={() => state.reconnect()}
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
            footer={
              <AlertPrimaryButton
                title={draft.id ? '변경 사항 저장' : '알림 저장'}
                busy={busy}
                onPress={() => void state.submit()}
              />
            }
          />
        </>
      ) : !all ? (
        <EmptyAlertCard transport="bus" kind={kind} disabled={busy} />
      ) : state.isPending ? (
        <ListSkeleton variant="alert" />
      ) : (
        <>
          {visibleAlerts.length > 0 && (
            <EditableAlertList transport="bus" scrollableRef={scrollableRef} onDragActive={onDragActive} dismissVersion={dismissVersion} items={visibleAlerts} disabled={busy} render={(alert, editing, beginEditing) => {
              const kind = all ? (alert.scheduledEnabled ? 'time' : 'location') : selectedKind;
              return (
                <SavedAlertCard
                  editing={editing}
                  onLongPress={beginEditing}
                  compact={all}
                  transport="bus"
                  mode={alert.scheduledEnabled && alert.proximityEnabled ? 'both' : kind}
                  todayControl={
                    <AlertTodayControl transport="bus" alert={alert} kind={kind} busy={busy} editing={editing} onLongPress={beginEditing} />
                  }
                  title={`${alert.busNumber}번 버스`}
                  subtitle={[normalizeBusStopNumber(alert.stop.arsId), alert.stop.name].filter(Boolean).join(' · ')}
                  direction={<SavedBusAlertDirection alert={alert} />}
                  arrivals={<AlertArrivalTimes transport="bus" alert={alert} kind={kind} />}
                  summary={
                    kind === 'time'
                      ? `도착 ${alert.thresholdMinutes === 60 ? '1시간' : `${alert.thresholdMinutes}분`} 전${alert.advanceRepeatMinutes ? `부터 · ${alert.advanceRepeatMinutes}분마다` : ''}`
                      : `${alert.radius}m · ${alert.repeatMinutes === 0 ? '한 번만' : `${alert.repeatMinutes ?? 5}분마다`}`
                  }
                  detail={`${alert.days.map((day) => WEEKDAYS[day]).join(' · ')}${kind === 'time' ? ` · ${alert.startTime}–${alert.endTime}${state.pushStatus?.ready === false ? ' · 알림 연결 필요' : ''}` : ''}${alert.scheduledEnabled && alert.proximityEnabled ? ' · 시간·위치 함께 사용' : ''}`}
                  enabled={alert.enabled}
                  busy={busy}
                  onToggle={(value) => void state.toggle(alert, value)}
                  onEdit={() => state.edit(alert)}
                  onDelete={() => state.removeAlert(alert)}
                />
              );
            }} />
          )}
        </>
      )}
    </>
  );
}

/** Read the matching route's direction from the existing shared arrivals cache. */
function SavedBusAlertDirection({ alert }: { alert: BusAlert }) {
  const { data } = useBusArrivals(alert.stationId, false);
  const route = data?.find((arrival) => arrival.routeId === alert.routeId &&
    (alert.stationSeq === undefined || arrival.stationSeq === alert.stationSeq) &&
    (arrival.direction || arrival.nextStopName));
  const direction = (route?.direction || route?.nextStopName)?.replace(/\s*방면$/, '').trim();
  return direction ? <SavedAlertSecondaryText>{direction} 방면</SavedAlertSecondaryText> : null;
}
