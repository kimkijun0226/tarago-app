import {
  NaverMapView,
  NaverMapPathOverlay,
  NaverMapMarkerOverlay,
  type NaverMapViewRef,
} from "@mj-studio/react-native-naver-map";
import { SymbolView } from "expo-symbols";
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getNearbyBusStops,
  type BusStop,
} from "@/features/bus-stop/api/get-nearby-bus-stops";
import type { BusRouteDetail } from "@/features/bus-stop/api/get-bus-route-detail";
import { useNearbyBusStops } from "@/features/bus-stop/model/use-nearby-bus-stops";
import {
  getVisibleBusStopTiles,
  type BusStopTile,
} from "@/features/bus-stop/model/bus-stop-tile";
import { RouteBusStopMarker } from "@/features/bus-stop/ui/route-bus-stop-marker";
import { BusStopMarker } from "@/features/bus-stop/ui/bus-stop-marker";
import { BusStopBottomSheet } from "@/features/bus-stop/ui/bus-stop-bottom-sheet";
import { BusRouteBottomSheet } from "@/features/bus-stop/ui/bus-route-bottom-sheet";
import { useBusRouteDetail } from "@/features/bus-stop/model/use-bus-route-detail";
import {
  isRouteBusStop,
  getRouteStopOccurrence,
  type RouteSheetSnap,
} from "@/features/bus-stop/model/bus-route-presentation";
import {
  alignRouteToStops,
  getRouteDirectionMarkers,
} from "@/features/bus-stop/model/route-direction-markers";
import { useMapTabVisibility } from "@/components/map-tab-visibility";
import { useCurrentLocation } from "@/hooks/use-current-location";

const DEFAULT_CAMERA = {
  latitude: 37.4883019,
  longitude: 126.8168934,
  zoom: 17,
};
const ROUTE_DIRECTION_PATTERN = require("../../assets/images/route-direction-triangle.png");

/**
 * 지도 카메라의 보이는 영역으로 정류장 타일을 조회하고 선택한 정류장을 연다.
 *
 * 초기 카메라는 역곡 인근을 가리킨다. 실제 위치를 얻으면 현재 위치로 이동하며,
 * 위치 조회에 실패해도 사용자는 기본 지도에서 정류장을 탐색할 수 있다.
 * 카메라 이동 종료 이벤트에서만 조회·표시 영역을 반영한다.
 */
export default function MapScreen() {
  const params = useLocalSearchParams<{stationId?:string;latitude?:string;longitude?:string;notificationId?:string}>();
  const [mapReady,setMapReady] = useState(false);
  const mapRef = useRef<NaverMapViewRef>(null);
  const selectionRequest = useRef(0);
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const [busStopTiles, setBusStopTiles] = useState<BusStopTile[]>([]);
  const [directionCamera, setDirectionCamera] = useState<{
    zoom: number;
    region: Parameters<typeof getVisibleBusStopTiles>[1];
  } | null>(null);
  const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);
  const [showRouteSheet, setShowRouteSheet] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<{
    stationId: string;
    routeId: string;
    stationSeq: number;
  } | null>(null);
  const [routeSheetSnap, setRouteSheetSnap] = useState<RouteSheetSnap>("half");
  const [sheetHeight, setSheetHeight] = useState(0);
  const { setMapTabHidden } = useMapTabVisibility();
  const { getCurrentLocation, loading, position } = useCurrentLocation();
  const busStops = useNearbyBusStops(busStopTiles);
  const insets = useSafeAreaInsets();
  const { data: routeDetail } = useBusRouteDetail(
    selectedRoute?.stationId ?? "",
    selectedRoute?.routeId ?? "",
    selectedRoute?.stationSeq ?? 0,
    Boolean(selectedRoute),
  );

  const geometry=routeDetail?.geometry;
  const stops=routeDetail?.stops;
  const routeCoordinates = useMemo(
    () =>
      geometry?.source === "official" && stops
        ? alignRouteToStops(geometry.points, stops)
        : [],
    [geometry, stops],
  );
  const directionMarkers = useMemo(
    () =>
      directionCamera
        ? getRouteDirectionMarkers(
            routeCoordinates,
            directionCamera.zoom,
            directionCamera.region,
          )
        : [],
    [routeCoordinates, directionCamera],
  );

  const visibleBusStops = useMemo(() => {
    const region=directionCamera?.region;
    return busStops.filter(stop=>stop.id!==selectedBusStop?.id &&
      (!selectedRoute || !routeDetail || !isRouteBusStop(stop,routeDetail.stops)) && (!region || (
        stop.latitude>=region.latitude-region.latitudeDelta*.15 &&
        stop.latitude<=region.latitude+region.latitudeDelta*1.15 &&
        stop.longitude>=region.longitude-region.longitudeDelta*.15 &&
        stop.longitude<=region.longitude+region.longitudeDelta*1.15)));
  }, [busStops,selectedRoute,routeDetail,selectedBusStop?.id,directionCamera]);
  const routeStops = useMemo(() => {
    const ids = new Set<string>();
    return (routeDetail?.stops ?? []).filter((stop) => {
      if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude) || ids.has(stop.stationId)) return false;
      ids.add(stop.stationId);
      return true;
    });
  }, [routeDetail?.stops]);

  useEffect(() => () => setMapTabHidden(false), [setMapTabHidden]);

  // 패딩으로 시트 위의 지도 영역을 정하고, 줌은 유지한 채 선택 좌표만 이동한다.
  useEffect(() => {
    if (!selectedBusStop || sheetHeight === 0 || !initializedRef.current)
      return;
    const frame = requestAnimationFrame(() => {
      mapRef.current?.animateCameraTo({
        latitude: selectedBusStop.latitude,
        longitude: selectedBusStop.longitude,
        duration: 350,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedBusStop, sheetHeight]);

  const closeBusStop = useCallback(() => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedBusStop(null);
    setSheetHeight(0);
    setMapTabHidden(false);
  }, [setMapTabHidden]);

  const selectBusStop = useCallback((busStop: BusStop) => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedBusStop(busStop);
    setMapTabHidden(true);
  }, [setMapTabHidden]);

  /** 알림으로 연 정류장을 서버 데이터로 선택하고 해당 좌표로 지도를 이동한다. */
  useEffect(() => {
    if (!mapReady || !params.notificationId || !params.stationId) return;
    const latitude = Number(params.latitude), longitude = Number(params.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) return;
    const abort = new AbortController();
    void queryClient.fetchQuery({
      queryKey:['bus-stops','notification',params.stationId],
      queryFn:() => getNearbyBusStops({latitude,longitude,radius:100,signal:abort.signal}),
      staleTime:30*60_000,
    }).then(stops => {
      if (abort.signal.aborted) return;
      const stop = stops.find(item => item.id === params.stationId);
      if (!stop) throw new Error('알림의 정류장을 찾을 수 없습니다.');
      setSelectedRoute(null);
      selectBusStop(stop);
      mapRef.current?.animateCameraTo({latitude,longitude,zoom:17,duration:350});
    }).catch(error => {
      if (!abort.signal.aborted) Alert.alert('정류장을 열 수 없습니다',error instanceof Error ? error.message : '서버 연결을 확인해주세요.');
    });
    return () => abort.abort();
  },[mapReady,params.notificationId,params.stationId,params.latitude,params.longitude,selectBusStop,queryClient]);

  /** 활성화 정류소의 전체 버스 목록을 열면서 지도에는 현재 노선을 유지한다. */
  const selectRouteStop = useCallback(async (stop: BusRouteDetail["stops"][number]) => {
    if (!selectedRoute || !routeDetail) return;
    const request = ++selectionRequest.current;
    const occurrence = getRouteStopOccurrence(
      routeDetail.stops,
      stop.stationId,
      selectedRoute.stationSeq,
    );
    if (!occurrence) return;
    mapRef.current?.animateCameraTo({latitude:stop.latitude,longitude:stop.longitude,duration:250});
    try {
      let station = busStops.find((item) => isRouteBusStop(item, [stop]));
      if (!station) {
        const nearby = await queryClient.fetchQuery({
          queryKey: ["bus-stops", "route-stop", stop.stationId],
          queryFn: ({ signal }) =>
            getNearbyBusStops({
              latitude: stop.latitude,
              longitude: stop.longitude,
              radius: 100,
              signal,
            }),
          staleTime: 30 * 60_000,
        });
        station = nearby.find((item) => isRouteBusStop(item, [stop]));
      }
      if (request !== selectionRequest.current) return;
      if (!station)
        throw new Error("선택한 정류소의 서버 정보를 찾을 수 없습니다.");
      setSelectedBusStop(station);
      setSelectedRoute({
        stationId: station.id,
        routeId: selectedRoute.routeId,
        stationSeq: occurrence.stationSeq,
      });
      setShowRouteSheet(false);
      setRouteSheetSnap("half");
      setMapTabHidden(true);
    } catch (error) {
      if (request !== selectionRequest.current) return;
      Alert.alert(
        "정류소를 열 수 없습니다",
        error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.",
      );
    }
  }, [busStops, queryClient, selectedRoute, routeDetail, setMapTabHidden]);

  /** 노선 지도에서 돌아가면 원래 선택한 정류장 목록을 다시 보여 준다. */
  const closeRoute = useCallback(() => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedRoute(null);
    setRouteSheetSnap("half");
  }, []);

  /**
   * 보이는 타일이 바뀐 경우에만 조회 대상을 갱신한다.
   * @param zoom 정류장 노출 여부와 타일 크기를 결정할 지도 줌.
   * @param region 지도 화면의 지리적 범위.
   */
  const updateVisibleTiles = useCallback((zoom: number | undefined, region: Parameters<typeof getVisibleBusStopTiles>[1]) => {
    if (zoom !== undefined) setDirectionCamera({ zoom, region });
    const nextTiles = getVisibleBusStopTiles(zoom, region);
    if (nextTiles.length === 0 && !selectedRoute) closeBusStop();
    setBusStopTiles((currentTiles) =>
      haveSameTiles(currentTiles, nextTiles) ? currentTiles : nextTiles,
    );
  }, [closeBusStop, selectedRoute]);

  /** 지도 초기화와 위치 조회가 모두 끝난 경우에만 현재 좌표로 이동한다. */
  const moveToMyLocation = useCallback(async () => {
    if (!initializedRef.current) return;

    const coordinate = await getCurrentLocation();
    if (!coordinate) return;

    mapRef.current?.animateCameraTo({
      ...coordinate,
      zoom: 17,
      duration: 500,
    });
  }, [getCurrentLocation]);

  const onCameraIdle = useCallback(({ zoom, region }: {
    zoom?: number; region: Parameters<typeof getVisibleBusStopTiles>[1];
  }) => {
    updateVisibleTiles(zoom,region);
  }, [updateVisibleTiles]);

  const onMapInitialized = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setMapReady(true);
    if (!params.notificationId) void moveToMyLocation();
  }, [moveToMyLocation,params.notificationId]);

  const selectSelectedStop = useCallback((station: BusStop) => {
    const routeStop = selectedRoute && routeDetail?.stops.find((stop) => isRouteBusStop(station, [stop]));
    if (routeStop) void selectRouteStop(routeStop);
    else selectBusStop(station);
  }, [selectedRoute, routeDetail, selectRouteStop, selectBusStop]);
  const selectBusRoute = useCallback((routeId: string, stationSeq: number) => {
    if (!selectedBusStop) return;
    setSelectedRoute({ stationId: selectedBusStop.id, routeId, stationSeq });
    setShowRouteSheet(true);
    setRouteSheetSnap("half");
  }, [selectedBusStop]);

  return (
    <View style={styles.container}>
      <NaverMapView
        ref={mapRef}
        style={styles.container}
        initialCamera={DEFAULT_CAMERA}
        mapPadding={{
          top: insets.top,
          bottom: selectedBusStop ? sheetHeight + insets.bottom + 8 : 0,
        }}
        isShowLocationButton={false}
        isShowZoomControls={false}
        locationOverlay={{
          isVisible: position !== null,
          position: position ?? DEFAULT_CAMERA,
        }}
        onInitialized={onMapInitialized}
        onCameraIdle={onCameraIdle}
      >
        {selectedRoute && routeCoordinates.length > 1 ? (
          <NaverMapPathOverlay
            key={`route:${selectedRoute.routeId}`}
            coords={routeCoordinates}
            color="#00A86B"
            passedColor="#00A86B"
            width={6}
            outlineColor="#FFFFFF"
            passedOutlineColor="#FFFFFF"
            outlineWidth={2}
            globalZIndex={100000}
            zIndex={0}
          />
        ) : null}
        {selectedRoute &&
          directionMarkers.map((marker) => (
            <NaverMapMarkerOverlay
              key={`direction:${marker.id}`}
              latitude={marker.latitude}
              longitude={marker.longitude}
              image={ROUTE_DIRECTION_PATTERN}
              width={12}
              height={12}
              anchor={{ x: 0.5, y: 0.5 }}
              angle={marker.angle}
              isFlatEnabled
              globalZIndex={100000}
              zIndex={2}
            />
          ))}
        {visibleBusStops
          .map((busStop) => (
            <BusStopMarker
              key={busStop.id}
              busStop={busStop}
              selected={false}
              onRoute={Boolean(
                selectedRoute &&
                routeDetail &&
                isRouteBusStop(busStop, routeDetail.stops),
              )}
              onSelect={selectBusStop}
            />
          ))}
        {selectedRoute && routeStops.map((stop) => (
          <RouteBusStopMarker key={stop.stationId} stop={stop} onSelect={selectRouteStop} />
        ))}
        {routeDetail?.vehicles.map(vehicle=>{
          const stop=routeDetail.stops.find(item=>item.stationSeq===vehicle.stationSeq);
          if(!stop || !Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) return null;
          return <NaverMapMarkerOverlay key={`vehicle:${vehicle.vehicleId}`} latitude={stop.latitude} longitude={stop.longitude}
            image={require('../../assets/images/bus-stop-selected-marker.png')} width={30} height={36}
            caption={{text:`${routeDetail.busNumber} · 마지막 확인`,textSize:11,color:'#1769E0',haloColor:'#FFFFFF'}}
            globalZIndex={200001} zIndex={20} />;
        })}
        {selectedBusStop ? (
          <BusStopMarker
            key={`selected-stop:${selectedBusStop.id}`}
            busStop={selectedBusStop}
            selected
            onRoute={Boolean(
              selectedRoute &&
              routeDetail &&
              isRouteBusStop(selectedBusStop, routeDetail.stops),
            )}
            onSelect={selectSelectedStop}
          />
        ) : null}
      </NaverMapView>

      {selectedRoute ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="정류장 버스 목록으로 돌아가기"
          onPress={closeRoute}
          style={[styles.backButton, { top: insets.top + 12 }]}
        >
          <SymbolView
            name={{
              ios: "chevron.left",
              android: "arrow_back",
              web: "arrow_back",
            }}
            size={24}
            tintColor="#15171A"
          />
        </Pressable>
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
            bottom: selectedBusStop
              ? sheetHeight + insets.bottom + 24
              : insets.bottom + 16,
          },
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#1769E0" />
        ) : (
          <SymbolView
            name={{
              ios: "location.north.fill",
              android: "my_location",
              web: "my_location",
            }}
            size={24}
            tintColor="#1769E0"
          />
        )}
      </Pressable>

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
          onClose={closeBusStop}
          onHeightChange={setSheetHeight}
          onSelectRoute={selectBusRoute}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  locationButton: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DADCE0",
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    left: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  pressed: {
    opacity: 0.7,
  },
});

/**
 * 같은 타일 집합이면 React 상태 갱신을 건너뛰어 불필요한 조회를 막는다.
 * @param currentTiles 현재 조회 중인 타일.
 * @param nextTiles 새 카메라 영역에서 계산한 타일.
 * @returns 타일 개수·인덱스·크기가 모두 같으면 `true`.
 */
function haveSameTiles(currentTiles: BusStopTile[], nextTiles: BusStopTile[]) {
  return (
    currentTiles.length === nextTiles.length &&
    currentTiles.every(
      (tile, index) =>
        tile.tileX === nextTiles[index]?.tileX &&
        tile.tileY === nextTiles[index]?.tileY &&
        tile.sizeMeters === nextTiles[index]?.sizeMeters,
    )
  );
}
