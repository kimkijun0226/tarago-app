/**
 * @fileoverview 지도 탭 라우트. 지도·검색·정류장·지하철 시트를 배치한다.
 * 데이터 조회와 선택 전환은 useMapController에 맡겨 화면 배치와 동작 규칙을 분리한다.
 */
import { BusRouteBottomSheet } from '@/features/bus-stop/ui/bus-route-bottom-sheet';
import { BusStopBottomSheet } from '@/features/bus-stop/ui/bus-stop-bottom-sheet';
import { MobilitySearch } from '@/features/mobility/ui/mobility-search';
import { SubwayArrivalSheet } from '@/features/subway/ui/subway-arrival-sheet';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { TmapView } from '@/shared/ui/tmap/tmap-view';
import { useState } from 'react';
import type { MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useMapController } from '@/features/map/model/use-map-controller';
import { MapLocationGate } from '@/features/map/ui/map-location-gate';
import { styles } from '@/features/map/ui/map-screen.styles';

/**
 * 컨트롤러가 제공하는 상태로 지도와 필요한 시트만 렌더링한다.
 * 단순한 스타일·표시 분기는 작은 계산이고 소비자가 참조 안정성에 의존하지 않아 useMemo를 추가하지 않는다.
 */
export default function MapScreen() {
  /** 지도 표시 값과 사용자 동작을 컨트롤러에서 받아 UI에 연결한다. 각 상태와 동작의 의미는 해당 훅의 선언에서 설명한다. */
  const {
    colors,
    initialPosition,
    preparingLocation,
    prepareInitialPosition,
    mapRef,
    markers,
    lines,
    position,
    insets,
    planningActive,
    sheetHeight,
    onMapInitialized,
    onCameraIdle,
    onMarkerPress,
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
    routeIntent,
    showJourney,
    activateSearch,
    openSubway,
    getCurrentLocation,
    onPlanningChange,
    onEndpoints,
    subwayStation,
    subwaySheetSnap,
    subwayLineName,
    closeSubway,
    setSubwaySheetSnap,
    routeFromBusStop,
    routeFromSubway,
    selectSubwayStation,
  } = useMapController();
  /** 정류장 시트가 전체 높이일 때 지도 검색창과 상태 표시줄 배경을 함께 전환한다. */
  const [busStopSheetSnap, setBusStopSheetSnap] = useState<MapSheetSnap>('half');

  /** 다른 시트를 열 때 남은 높이 상태로 검색창을 숨기지 않도록 현재 선택도 확인한다. */
  const fullBusStop = Boolean(selectedBusStop && !showRouteSheet && busStopSheetSnap === 'full');

  if (!initialPosition)
    return <MapLocationGate preparing={preparingLocation} onRetry={prepareInitialPosition} />;
  return (
    <View style={styles.container}>
      <TmapView
        ref={mapRef}
        style={styles.container}
        initialCamera={{ ...initialPosition, zoom: 17 }}
        markers={markers}
        lines={lines}
        position={position}
        padding={{
          top: insets.top + (planningActive ? 150 : 120),
          bottom: sheetHeight ? sheetHeight + insets.bottom + 8 : 0,
        }}
        onReady={onMapInitialized}
        onCameraIdle={onCameraIdle}
        onMarkerPress={onMarkerPress}
      />

      {selectedRoute ? (
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
            tintColor={colors.text}
          />
        </Pressable>
      ) : null}

      {!planningActive ? (
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
              bottom: sheetHeight ? sheetHeight + insets.bottom + 24 : insets.bottom + 16,
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
              tintColor={mapUi.text}
            />
          )}
        </Pressable>
      ) : null}

      {selectedBusStop && selectedRoute && showRouteSheet ? (
        <BusRouteBottomSheet
          key={`${selectedBusStop.id}:${selectedRoute.routeId}:${selectedRoute.stationSeq}`}
          stationId={selectedRoute.stationId}
          routeId={selectedRoute.routeId}
          stationSeq={selectedRoute.stationSeq}
          snap={routeSheetSnap}
          onChangeSnap={setRouteSheetSnap}
          onClose={closeRoute}
          onHeightChange={setSheetHeight}
        />
      ) : selectedBusStop ? (
        <BusStopBottomSheet
          key={selectedBusStop.id}
          busStop={selectedBusStop}
          position={position}
          onClose={closeBusStop}
          onHeightChange={setSheetHeight}
          onSelectRoute={selectBusRoute}
          onChangeSnap={setBusStopSheetSnap}
          onStart={() => routeFromBusStop('start')}
          onEnd={() => routeFromBusStop('end')}
        />
      ) : null}

      <View
        pointerEvents={fullBusStop ? 'none' : 'box-none'}
        style={[
          { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
          fullBusStop && { display: 'none' },
        ]}
      >
        <MobilitySearch
          position={position ?? initialPosition}
          top={insets.top + 12}
          left={selectedRoute ? 76 : 16}
          onPlace={selectPlace}
          routeIntent={routeIntent}
          onGeometry={showJourney}
          onActivate={activateSearch}
          onSheetHeight={setSheetHeight}
          onSubway={openSubway}
          getPosition={getCurrentLocation}
          onPlanningChange={onPlanningChange}
          onEndpoints={onEndpoints}
          suspended={Boolean(subwayStation || selectedBusStop)}
        />
      </View>

      {fullBusStop || (subwayStation && subwaySheetSnap === 'full') ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: insets.top,
            backgroundColor: mapUi.background,
          }}
        />
      ) : null}

      {subwayStation ? (
        <SubwayArrivalSheet
          initialLineName={subwayLineName}
          stationName={subwayStation}
          onClose={closeSubway}
          onChangeSnap={setSubwaySheetSnap}
          onHeightChange={setSheetHeight}
          onStart={() => routeFromSubway('start')}
          onEnd={() => routeFromSubway('end')}
          onSelectStation={(name, lineName, point) =>
            void selectSubwayStation(name, lineName, point)
          }
        />
      ) : null}
    </View>
  );
}
