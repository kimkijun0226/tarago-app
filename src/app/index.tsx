import { TmapView, type TmapViewRef, type TmapMarker, type TmapLine } from '@/shared/ui/tmap/tmap-view';
import { markerImage, stopMarker, routeStopImage } from '@/features/bus-stop/model/map-markers';
import { SubwayArrivalSheet } from '@/features/subway/ui/subway-arrival-sheet';
import { SymbolView } from "expo-symbols";
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  Linking,
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
import { BusStopBottomSheet } from "@/features/bus-stop/ui/bus-stop-bottom-sheet";
import { MobilitySearch } from '@/features/mobility/ui/mobility-search';
import { isBusStopPlace, stationSearchName } from '@/features/mobility/model/place-kind';
import type { Place, Point } from '@/features/mobility/api/mobility';
import { useAppTheme } from '@/shared/ui/design-system';
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

const ROUTE_DIRECTION_PATTERN = require("../../assets/images/route-direction-triangle.png");

/**
 * 지도 카메라의 보이는 영역으로 정류장 타일을 조회하고 선택한 정류장을 연다.
 *
 * 현재 위치를 준비한 후 해당 좌표를 초기 카메라로 사용한다.
 * 위치 조회 실패 시 임의의 지역 대신 재시도 화면을 제공한다.
 * 카메라 이동 종료 이벤트에서만 조회·표시 영역을 반영한다.
 */
export default function MapScreen() {
  const {colors}=useAppTheme();
  const [subwayStation, setSubwayStation] = useState<string | null>(null);
  const [selectedPlace,setSelectedPlace]=useState<Place|null>(null);
  const [journeyLines,setJourneyLines]=useState<Point[][]>([]);
  const params = useLocalSearchParams<{stationId?:string;latitude?:string;longitude?:string;notificationId?:string}>();
  const [initialPosition,setInitialPosition]=useState<{latitude:number;longitude:number}|null>(null);
  const [preparingLocation,setPreparingLocation]=useState(true);
  const startupRequested=useRef(false);
  const [mapReady,setMapReady] = useState(false);
  const mapRef = useRef<TmapViewRef>(null);
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
  const prepareInitialPosition=useCallback(async()=>{
    setPreparingLocation(true);
    try {
      const latitude=Number(params.latitude),longitude=Number(params.longitude);
      if(params.notificationId && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude)<=90 && Math.abs(longitude)<=180) {
        setInitialPosition({latitude,longitude});return;
      }
      const coordinate=await getCurrentLocation();
      if(coordinate) setInitialPosition(coordinate);
    } finally {setPreparingLocation(false);}
  },[getCurrentLocation,params.notificationId,params.latitude,params.longitude]);
  useEffect(()=>{
    if(startupRequested.current)return;
    startupRequested.current=true;void prepareInitialPosition();
  },[prepareInitialPosition]);
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
    setSubwayStation(null);
    setSelectedPlace(null);setJourneyLines([]);
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedBusStop(busStop);
    setMapTabHidden(true);
  }, [setMapTabHidden]);

  const selectPlace=useCallback(async(place:Place|null,showBusStop=false)=>{
    const request=++selectionRequest.current;
    setSubwayStation(null);setSelectedPlace(place);
    if(!place){setSheetHeight(0);return;}
    setShowRouteSheet(false);setSelectedRoute(null);setSelectedBusStop(null);setSheetHeight(0);setMapTabHidden(false);
    mapRef.current?.animateCameraTo({...place,zoom:17,duration:350});
    if (!showBusStop || !isBusStopPlace(place)) return;
    try {
      const nearby=await queryClient.fetchQuery({
        queryKey:['bus-stops','place',place.id,place.latitude,place.longitude],
        queryFn:({signal})=>getNearbyBusStops({...place,radius:120,signal}),staleTime:30*60_000,
      });
      if (request!==selectionRequest.current) return;
      const name=stationSearchName(place.name);
      const matches=nearby.filter(stop=>{
        const other=stationSearchName(stop.name);
        return other===name || (name.length>=3 && other.length>=3 && (other.includes(name)||name.includes(other)));
      }).sort((a,b)=>a.distanceMeters-b.distanceMeters);
      if(matches[0])selectBusStop(matches[0]);
    } catch {
      if(request===selectionRequest.current)Alert.alert('정류장 버스 목록을 불러오지 못했어요','잠시 후 정류장을 다시 선택해주세요.');
    }
  },[setMapTabHidden,queryClient,selectBusStop]);
  const activateSearch=useCallback(()=>{
    setSubwayStation(null);
    selectionRequest.current++;setShowRouteSheet(false);setSelectedRoute(null);setSelectedBusStop(null);setSheetHeight(0);setMapTabHidden(false);
  },[setMapTabHidden]);
  const showJourney=useCallback((lines:Point[][])=>{
    setJourneyLines(lines);
    const points=lines.flat();
    if(!points.length)return;
    const bounds=points.reduce((b,p)=>({south:Math.min(b.south,p.latitude),west:Math.min(b.west,p.longitude),north:Math.max(b.north,p.latitude),east:Math.max(b.east,p.longitude)}),
      {south:points[0].latitude,west:points[0].longitude,north:points[0].latitude,east:points[0].longitude});
    mapRef.current?.animateCameraWithTwoCoords({coord1:{latitude:bounds.south,longitude:bounds.west},
      coord2:{latitude:bounds.north,longitude:bounds.east},duration:350});
  },[]);

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
  }, []);

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

  const markers = useMemo<TmapMarker[]>(() => {
    const items = visibleBusStops.map(stop => stopMarker(stop, false));
    if (selectedRoute) items.push(...routeStops.map(stop => ({
      id: `route-stop:${stop.stationId}`, latitude: stop.latitude, longitude: stop.longitude,
      imageUri: routeStopImage, width: 24, height: 24, anchor: {x:.5,y:.5},
      caption: stop.name, minZoom: 13,
    })));
    if (selectedBusStop) items.push(stopMarker(selectedBusStop, true, Boolean(selectedRoute)));
    if (selectedPlace) items.push({ ...selectedPlace, id: `place:${selectedPlace.id}`, caption:selectedPlace.name, kind:'place', width:32,height:40 });
    if (selectedRoute) items.push(...directionMarkers.map(marker => ({
      id: `direction:${marker.id}`, latitude:marker.latitude, longitude:marker.longitude,
      imageUri:markerImage(ROUTE_DIRECTION_PATTERN), width:12,height:12,anchor:{x:.5,y:.5},rotation:marker.angle,
    })));
    return items;
  }, [visibleBusStops,selectedRoute,routeStops,selectedBusStop,selectedPlace,directionMarkers]);
  const lines = useMemo<TmapLine[]>(() => [
    ...(selectedRoute && routeCoordinates.length>1 ? [{id:`route:${selectedRoute.routeId}`,points:routeCoordinates,color:'#00A86B',width:6}] : []),
    ...journeyLines.map((points,index)=>({id:`journey:${index}`,points,color:colors.accent,width:6})),
  ], [selectedRoute,routeCoordinates,journeyLines,colors.accent]);
  const onMarkerPress = useCallback((id:string) => {
    if(id.startsWith('stop:')) {
      const stop = selectedBusStop?.id===id.slice(5) ? selectedBusStop : busStops.find(item=>item.id===id.slice(5));
      if(stop) {if(stop.id===selectedBusStop?.id) selectSelectedStop(stop);else selectBusStop(stop);}
    } else if(id.startsWith('route-stop:')) {
      const stop=routeStops.find(item=>item.stationId===id.slice(11));if(stop)void selectRouteStop(stop);
    }
  }, [selectedBusStop,busStops,routeStops,selectSelectedStop,selectBusStop,selectRouteStop]);
  const openSubway = useCallback((stationName:string) => {
    activateSearch();setSubwayStation(stationName);setMapTabHidden(true);
  }, [activateSearch,setMapTabHidden]);
  const closeSubway = useCallback(() => {
    setSubwayStation(null);setSheetHeight(0);setMapTabHidden(false);
  }, [setMapTabHidden]);

  if(!initialPosition) return <View style={{flex:1,backgroundColor:'#208AEF',justifyContent:'center',alignItems:'center',gap:20,padding:32}}>
    <Text style={{color:'#FFFFFF',fontSize:40,fontWeight:'800'}}>타라고</Text>
    {preparingLocation ? <><ActivityIndicator color="#FFFFFF" /><Text style={{color:'#FFFFFF'}}>현재 위치를 찾고 있어요</Text></> : <>
      <Text style={{color:'#FFFFFF'}}>현재 위치를 확인하지 못했어요.</Text>
      <Pressable onPress={()=>void prepareInitialPosition()}><Text style={{color:'#FFFFFF',fontSize:18,padding:12}}>다시 찾기</Text></Pressable>
      <Pressable onPress={()=>void Linking.openSettings().catch(()=>Alert.alert('설정을 열지 못했어요','기기 설정에서 타라고의 위치 권한을 확인해주세요.'))}><Text style={{color:'#FFFFFF',padding:12}}>위치 설정 열기</Text></Pressable>
    </>}
  </View>;
  return (
    <View style={styles.container}>
      <TmapView ref={mapRef} style={styles.container} initialCamera={{...initialPosition,zoom:17}}
        markers={markers} lines={lines} position={position}
        padding={{top:insets.top+72,bottom:sheetHeight ? sheetHeight+insets.bottom+8 : 0}}
        onReady={onMapInitialized} onCameraIdle={onCameraIdle} onMarkerPress={onMarkerPress} />


      {selectedRoute ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="정류장 버스 목록으로 돌아가기"
          onPress={closeRoute}
          style={[styles.backButton, { top: insets.top + 12,backgroundColor:colors.surface }]}
        >
          <SymbolView
            name={{
              ios: "chevron.left",
              android: "arrow_back",
              web: "arrow_back",
            }}
            size={24}
            tintColor={colors.text}
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
            backgroundColor:colors.surface,
            bottom: sheetHeight
              ? sheetHeight + insets.bottom + 24
              : insets.bottom + 16,
          },
          pressed && styles.pressed,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <SymbolView
            name={{
              ios: "location.north.fill",
              android: "my_location",
              web: "my_location",
            }}
            size={24}
            tintColor={colors.accent}
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
      <MobilitySearch position={position??initialPosition} top={insets.top+12} left={selectedRoute ? 76 : 16} onPlace={selectPlace}
        onGeometry={showJourney} onActivate={activateSearch} onSheetHeight={setSheetHeight} onSubway={openSubway} getPosition={getCurrentLocation} suspended={Boolean(subwayStation || selectedBusStop)} />
      {subwayStation ? <SubwayArrivalSheet stationName={subwayStation} onClose={closeSubway} onHeightChange={setSheetHeight} /> : null}
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
