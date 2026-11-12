import { EdgeBack } from '@/shared/ui/edge-back';
/**
 * @fileoverview 지도 탭과 즐겨찾기 전용 지도가 공유하는 화면. 선택 상태와 이동 경로는 mode별로 분리한다.
 * 데이터 조회와 선택 전환은 useMapController에 맡겨 화면 배치와 동작 규칙을 분리한다.
 */
import { BusRouteBottomSheet } from '@/features/bus-stop/ui/bus-route-bottom-sheet';
import { BusStopBottomSheet } from '@/features/bus-stop/ui/bus-stop-bottom-sheet';
import { MobilitySearch } from '@/features/mobility/ui/mobility-search';
import { SubwayLineChoiceSheet } from './subway-line-choice-sheet';
import { SubwayArrivalSheet } from '@/features/subway/ui/subway-arrival-sheet';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { MapView } from '@/shared/ui/map/map-view';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useWidgetSelection } from '@/features/widgets/model/widget-selection';
import { useMapSelection, type MapSelectionMode } from '@/features/map/model/map-selection';
import { useAppStore } from '@/shared/model/app-store';
import { AlertMapPicker } from '@/features/map/ui/alert-map-picker';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useMapController } from '@/features/map/model/use-map-controller';
import { MapLocationGate } from '@/features/map/ui/map-location-gate';
import { styles } from '@/features/map/ui/map-screen.styles';

/**
 * 컨트롤러가 제공하는 상태로 지도와 필요한 시트만 렌더링한다.
 * 단순한 스타일·표시 분기는 작은 계산이고 소비자가 참조 안정성에 의존하지 않아 useMemo를 추가하지 않는다.
 */
export default function MapScreen({ mode = 'map' }: { mode?: MapSelectionMode }) {
  const { height: screenHeight } = useWindowDimensions();
  const [mapHeight, setMapHeight] = useState(screenHeight);
  const alertSelection = useMapSelection(mode);
  const finishAlertSelection = useAppStore((state) => state.finishAlertSelection);
  /** 지도 표시 값과 사용자 동작을 컨트롤러에서 받아 UI에 연결한다. 각 상태와 동작의 의미는 해당 훅의 선언에서 설명한다. */
  const {
    colors,
    selectedPlace,
    resetAlertMapSelection,
    initialPosition,
    preparingLocation,
    prepareInitialPosition,
    mapRef,
    markers,
    lines,
    position,
    insets,
    searchActive,
    sheetHeight,
    locationBottomPadding,
    onMapInitialized,
    onCameraIdle,
    onMarkerPress,
    onSymbolPress,
    subwayLineChoices,
    selectSubwayLineChoice,
    selectedRoute,
    configureRouteAlert,
    routeAlertReady,
    closeRoute,
    loading,
    moveToMyLocation,
    selectedBusStop,
    showRouteSheet,
    routeSheetSnap,
    setRouteSheetSnap,
    setSheetHeight,
    closeBusStop,
    selectBusRoute,
    selectRouteStop,
    selectPlace,
    activateSearch,
    setSearchMapRequest,
    selectedSearchId,
    selectSearchResult,
    searchMapActive,
    openSubway,
    onSearchActiveChange,
    subwayStation,
    subwaySheetSnap,
    subwayLineName,
    closeSubway,
    setSubwaySheetSnap,
    selectSubwayStation,
  } = useMapController(mode);
  const cancelAlertSelection = useCallback(() => {
    resetAlertMapSelection();
    if (mode === 'widget') {
      useWidgetSelection.getState().finishMapSelection();
      router.dismissTo('/widget-add');
    } else {
      finishAlertSelection();
      router.navigate('/alerts');
    }
  }, [resetAlertMapSelection, finishAlertSelection, mode]);
  useFocusEffect(
    useCallback(() => {
      if (!alertSelection) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        cancelAlertSelection();
        return true;
      });
      return () => subscription.remove();
    }, [alertSelection, cancelAlertSelection]),
  );
  /** 정착 높이 상태 대신 시트의 UI 스레드 위치를 사용해 드래그 중에도 버튼을 동기화한다. */
  const sheetPosition = useSharedValue(screenHeight);
  const hasSheet = Boolean(
    (alertSelection && !searchActive) || selectedBusStop || subwayStation || subwayLineChoices.length || searchMapActive,
  );
  useEffect(() => {
    if (!hasSheet) sheetPosition.value = withTiming(screenHeight, { duration: 180 });
  }, [hasSheet, screenHeight, sheetPosition]);
  const locationStyle = useAnimatedStyle(() => {
    const top =
      selectedPlace && !alertSelection
        ? mapHeight - sheetHeight - 60
        : hasSheet
          ? sheetPosition.value - 60
          : mapHeight - insets.bottom - 64;
    const visible = top >= insets.top + 64 && !(searchActive && !searchMapActive);
    return { top: visible ? top : -100, opacity: visible ? 1 : 0 };
  });
  /** 알림 선택 중에도 검색창을 유지한다. */
  const hideSearch = Boolean(!alertSelection && selectedRoute && showRouteSheet);
  const searchOpacity = useSharedValue(1);
  useEffect(() => {
    searchOpacity.value = withTiming(hideSearch ? 0 : 1, {
      duration: 220,
      easing: Easing.inOut(Easing.ease),
    });
  }, [hideSearch, searchOpacity]);
  const searchStyle = useAnimatedStyle(() => ({
    opacity: searchOpacity.value,
    transform: [{ translateY: -8 * (1 - searchOpacity.value) }],
  }));

  const searchBack = useRef<(() => void) | null>(null);
  const subwayBack = useRef<(() => void) | null>(null);
  const canGoBackInMap = Boolean(
    mode === 'widget' || searchActive || alertSelection || selectedBusStop || subwayStation || subwayLineChoices.length || selectedPlace,
  );
  const goBackInMap = useCallback(() => {
    if (subwayLineChoices.length) closeSubway();
    else if (searchActive && !selectedBusStop && !subwayStation) searchBack.current?.();
    else if (alertSelection) cancelAlertSelection();
    else if (selectedRoute && showRouteSheet) closeRoute();
    else if (selectedBusStop) closeBusStop();
    else if (subwayStation) subwayBack.current?.();
    else if (selectedPlace) searchBack.current?.();
    else if (mode === 'widget') cancelAlertSelection();
  }, [
    alertSelection, cancelAlertSelection, closeBusStop, closeRoute, closeSubway, mode, searchActive, subwayLineChoices.length,
    selectedBusStop, selectedPlace, selectedRoute, showRouteSheet, subwayStation,
  ]);

  const alertBackButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        mode === 'widget' ? '즐겨찾기 교통수단 선택으로 돌아가기' : '알림 설정으로 돌아가기'
      }
      onPress={cancelAlertSelection}
      style={[styles.backButton, { top: insets.top + 12, backgroundColor: colors.surface }]}
    >
      <SymbolView
        name={{ ios: 'chevron.left', android: 'arrow_back' }}
        size={20}
        tintColor={colors.accent}
      />
    </Pressable>
  );
  if (!initialPosition)
    return (
      <EdgeBack enabled={canGoBackInMap} onBack={goBackInMap}>
      <View
        style={styles.container}
        onLayout={(event) => setMapHeight(event.nativeEvent.layout.height)}
      >
        <MapLocationGate preparing={preparingLocation} onRetry={prepareInitialPosition} />
        {alertSelection ? alertBackButton : null}
      </View>
      </EdgeBack>
    );
  return (
    <EdgeBack enabled={canGoBackInMap} onBack={goBackInMap}>
    <View
      style={styles.container}
      onLayout={(event) => setMapHeight(event.nativeEvent.layout.height)}
    >
      <MapView
        ref={mapRef}
        style={styles.container}
        initialCamera={{
          ...initialPosition,
          zoom: alertSelection ? (alertSelection.transport === 'subway' ? 17 : 15) : 17,
        }}
        subwaySelection={alertSelection?.transport === 'subway'}
        markers={markers}
        lines={lines}
        position={position}
        logoBottomInset={
          (selectedBusStop || subwayStation) &&
          sheetHeight > 0 &&
          sheetHeight < screenHeight - insets.top - 9 &&
          insets.bottom >= 28
            ? 6
            : Math.max(insets.bottom + 72, sheetHeight + insets.bottom + 20)
        }
        padding={{
          top: insets.top + 76,
          // 선택 시 가림 영역은 고정해 시트 드래그가 지도 카메라를 바꾸지 않도록 한다.
          bottom:
            (alertSelection ? sheetHeight + 8 : locationBottomPadding) ??
            (selectedBusStop || subwayStation || searchMapActive
              ? screenHeight * 0.47 + insets.bottom + 8
              : 0),
        }}
        onReady={onMapInitialized}
        onCameraIdle={onCameraIdle}
        onMarkerPress={onMarkerPress}
        onSymbolPress={onSymbolPress}
      />

      {alertSelection && !searchActive ? (
        alertBackButton
      ) : selectedBusStop && selectedRoute && showRouteSheet ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="정류장 버스 목록으로 돌아가기"
          onPress={closeRoute}
          style={[styles.backButton, { top: insets.top + 12, backgroundColor: colors.surface }]}
        >
          <SymbolView
            name={{
              ios: 'chevron.left',
              android: 'arrow_back',
            }}
            size={20}
            tintColor={colors.accent}
          />
        </Pressable>
      ) : null}

      <Animated.View
        pointerEvents={searchActive && !searchMapActive ? 'none' : 'auto'}
        style={[
          {
            opacity: searchActive && !searchMapActive ? 0 : 1,
            position: 'absolute',
            right: 16,
            zIndex: 25,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          },
          locationStyle,
        ]}
      >
        {!alertSelection && selectedBusStop && selectedRoute && showRouteSheet ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['time', 'location'] as const).map((kind) => (
              <Pressable
                key={kind}
                accessibilityRole="button"
                accessibilityLabel={`${kind === 'time' ? '예약' : '위치'} 알림 설정`}
                disabled={!routeAlertReady}
                onPress={() => configureRouteAlert(kind)}
                style={({ pressed }) => [
                  styles.locationButton,
                  {
                    position: 'relative',
                    right: 0,
                    width: 'auto',
                    paddingHorizontal: 14,
                    flexDirection: 'row',
                    gap: 6,
                    backgroundColor: colors.surface,
                    opacity: !routeAlertReady ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <SymbolView
                  name={
                    kind === 'time'
                      ? { ios: 'clock', android: 'schedule' }
                      : { ios: 'location', android: 'near_me' }
                  }
                  size={18}
                  tintColor={colors.accent}
                />
                <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '600' }}>
                  {kind === 'time' ? '예약' : '위치'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="현재 위치로 지도 이동"
          accessibilityState={{ disabled: loading, busy: loading }}
          disabled={loading}
          onPress={moveToMyLocation}
          style={({ pressed }) => [
            styles.locationButton,
            {
              backgroundColor: colors.surface,
              position: 'relative',
              right: 0,
            },
            pressed && styles.pressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <SymbolView
              name={{
                ios: 'scope',
                android: 'my_location',
              }}
              size={24}
              tintColor={mapUi.blue}
            />
          )}
        </Pressable>
      </Animated.View>

      {alertSelection ? null : selectedBusStop && selectedRoute && showRouteSheet ? (
        <BusRouteBottomSheet
          key={`${selectedBusStop.id}:${selectedRoute.routeId}:${selectedRoute.stationSeq}`}
          stationId={selectedRoute.stationId}
          routeId={selectedRoute.routeId}
          stationSeq={selectedRoute.stationSeq}
          source={selectedRoute.source}
          snap={routeSheetSnap}
          onChangeSnap={setRouteSheetSnap}
          onClose={closeRoute}
          onSelectStop={(stop) => void selectRouteStop(stop)}
          onHeightChange={setSheetHeight}
          animatedPosition={sheetPosition}
        />
      ) : selectedBusStop ? (
        <BusStopBottomSheet
          key={selectedBusStop.id}
          busStop={selectedBusStop}
          position={position}
          onClose={closeBusStop}
          onHeightChange={setSheetHeight}
          animatedPosition={sheetPosition}
          onSelectRoute={selectBusRoute}
        />
      ) : null}

      <Animated.View
        pointerEvents={hideSearch ? 'none' : 'box-none'}
        style={[
          { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
          { zIndex: 10 },
          searchStyle,
        ]}
      >
        <MobilitySearch
          backRef={searchBack}
          key={alertSelection?.requestId ?? 'map-search'}
          position={position ?? initialPosition}
          top={insets.top + 12}
          left={alertSelection && !searchActive ? 68 : 16}
          alertTransport={alertSelection?.transport}
          onPlace={selectPlace}
          onActivate={activateSearch}
          onSearchMap={setSearchMapRequest}
          selectedSearchId={selectedSearchId}
          selectedPlace={selectedPlace}
          onSearchSelect={selectSearchResult}
          onSheetHeight={setSheetHeight}
          animatedPosition={sheetPosition}
          onSubway={openSubway}
          onSearchActiveChange={onSearchActiveChange}
          suspended={Boolean(subwayStation || selectedBusStop || selectedPlace)}
        />
      </Animated.View>

      {!alertSelection && subwayLineChoices.length > 0 ? (
        <SubwayLineChoiceSheet
          stations={subwayLineChoices}
          onClose={closeSubway}
          onSelect={selectSubwayLineChoice}
          onHeightChange={setSheetHeight}
          animatedPosition={sheetPosition}
        />
      ) : null}
      {!alertSelection && subwayStation ? (
        <SubwayArrivalSheet
          backRef={subwayBack}
          initialLineName={subwayLineName}
          stationName={subwayStation}
          snap={subwaySheetSnap}
          onClose={closeSubway}
          onChangeSnap={setSubwaySheetSnap}
          onHeightChange={setSheetHeight}
          animatedPosition={sheetPosition}
          onSelectStation={(name, lineName, point) =>
            void selectSubwayStation(name, lineName, point)
          }
        />
      ) : null}
      {alertSelection && !searchActive ? (
        <AlertMapPicker
          mode={mode}
          key={`${alertSelection.requestId}:${selectedBusStop?.id ?? subwayStation ?? ''}:${subwayLineName ?? ''}`}
          busStop={selectedBusStop}
          stationName={subwayStation}
          initialLineName={subwayLineName}
          stationPoint={selectedPlace}
          onSelectLine={(lineName) => {
            if (subwayStation) void selectSubwayStation(subwayStation, lineName);
          }}
          onHeightChange={setSheetHeight}
          animatedPosition={sheetPosition}
        />
      ) : null}
    </View>
    </EdgeBack>
  );
}
