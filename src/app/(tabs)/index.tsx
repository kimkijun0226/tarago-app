/**
 * @fileoverview 지도 탭 라우트. 지도·검색·정류장·지하철 시트를 배치한다.
 * 데이터 조회와 선택 전환은 useMapController에 맡겨 화면 배치와 동작 규칙을 분리한다.
 */
import { BusRouteBottomSheet } from '@/features/bus-stop/ui/bus-route-bottom-sheet';
import { BusStopBottomSheet } from '@/features/bus-stop/ui/bus-stop-bottom-sheet';
import { MobilitySearch } from '@/features/mobility/ui/mobility-search';
import { SubwayArrivalSheet } from '@/features/subway/ui/subway-arrival-sheet';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { MapView } from '@/shared/ui/map/map-view';
import { useCallback, useEffect } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { useAppStore } from '@/shared/model/app-store';
import { AlertMapPicker } from '@/features/map/ui/alert-map-picker';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, BackHandler, Pressable, View, useWindowDimensions } from 'react-native';
import { useMapController } from '@/features/map/model/use-map-controller';
import { MapLocationGate } from '@/features/map/ui/map-location-gate';
import { styles } from '@/features/map/ui/map-screen.styles';

/**
 * 컨트롤러가 제공하는 상태로 지도와 필요한 시트만 렌더링한다.
 * 단순한 스타일·표시 분기는 작은 계산이고 소비자가 참조 안정성에 의존하지 않아 useMemo를 추가하지 않는다.
 */
export default function MapScreen() {
  const { height: screenHeight } = useWindowDimensions();
  const alertSelection = useAppStore((state) => state.alertSelection);
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
    selectedRoute,
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
  } = useMapController();
  const cancelAlertSelection = useCallback(() => {
    resetAlertMapSelection();
    finishAlertSelection();
    router.navigate('/alerts');
  }, [resetAlertMapSelection, finishAlertSelection]);
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
  const hasSheet = Boolean((alertSelection && !searchActive) || selectedBusStop || subwayStation);
  useEffect(() => {
    if (!hasSheet) sheetPosition.value = withTiming(screenHeight, { duration: 180 });
  }, [hasSheet, screenHeight, sheetPosition]);
  const locationStyle = useAnimatedStyle(() => {
    const coveredHeight = Math.max(0, screenHeight - sheetPosition.value);
    return { transform: [{ translateY: -coveredHeight - Math.min(8, coveredHeight) }] };
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

  const alertBackButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="알림 설정으로 돌아가기"
      onPress={cancelAlertSelection}
      style={[styles.backButton, { top: insets.top + 12, backgroundColor: colors.surface }]}
    >
      <SymbolView
        name={{ ios: 'chevron.left', android: 'arrow_back' }}
        size={24}
        tintColor={colors.accent}
      />
    </Pressable>
  );
  if (!initialPosition)
    return (
      <View style={styles.container}>
        <MapLocationGate preparing={preparingLocation} onRetry={prepareInitialPosition} />
        {alertSelection ? alertBackButton : null}
      </View>
    );
  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.container}
        initialCamera={{
          ...initialPosition,
          zoom: alertSelection ? (alertSelection.transport === 'subway' ? 14 : 16) : 17,
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
            (alertSelection ? sheetHeight + insets.bottom + 8 : locationBottomPadding) ??
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
            size={24}
            tintColor={colors.accent}
          />
        </Pressable>
      ) : null}

      <Animated.View
        style={[
          {
            position: 'absolute',
            right: 16,
            bottom: insets.bottom + 16,
            zIndex: 25,
          },
          alertSelection ? { transform: [{ translateY: -sheetHeight }] } : locationStyle,
        ]}
      >
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
          key={alertSelection?.requestId ?? 'map-search'}
          position={position ?? initialPosition}
          top={insets.top + 12}
          left={alertSelection && !searchActive ? 76 : 16}
          alertTransport={alertSelection?.transport}
          onPlace={selectPlace}
          onActivate={activateSearch}
          onSearchMap={setSearchMapRequest}
          selectedSearchId={selectedSearchId}
          onSearchSelect={selectSearchResult}
          onSheetHeight={setSheetHeight}
          onSubway={openSubway}
          onSearchActiveChange={onSearchActiveChange}
          suspended={Boolean(subwayStation || selectedBusStop)}
        />
      </Animated.View>

      {!alertSelection && subwayStation ? (
        <SubwayArrivalSheet
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
          key={subwayStation ?? alertSelection.requestId}
          busStop={selectedBusStop}
          stationName={subwayStation}
          initialLineName={subwayLineName}
          stationPoint={selectedPlace}
          bottom={insets.bottom}
          onHeightChange={setSheetHeight}
          onComplete={resetAlertMapSelection}
        />
      ) : null}
    </View>
  );
}
