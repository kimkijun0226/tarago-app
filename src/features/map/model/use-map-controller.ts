/**
 * @fileoverview 지도 화면의 선택·전환을 조율하는 컨트롤러 훅.
 * 정류장·노선 Query와 검색 결과를 연결하고, 최신 선택만 반영하며 카메라와 시트를 함께 전환한다.
 * 오버레이 계산·GPS 권한·시트 내부 UI는 각 전용 모듈에 위임한다.
 */
import type { MapSymbol } from '@/shared/types/geo';

import type { BusArrival } from '@/features/bus-stop/api/get-bus-arrivals';
import { useSubwayMapStations } from '@/features/subway/model/use-subway-station';
import { selectMapSubwayStation } from '@/features/subway/model/select-map-subway-station';
import {
  getSubwayMapStations,
  type SubwayMapStation,
} from '@/features/subway/api/get-subway-station';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getNearbyBusStops, type BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import { searchBusStops } from '@/features/bus-stop/api/search-bus-stops';
import {
  busSymbolKey,
  matchBusStopSymbols,
} from '@/features/bus-stop/model/match-bus-stop-symbols';
import type { BusRouteDetail } from '@/features/bus-stop/api/get-bus-route-detail';
import { useNearbyBusStops } from '@/features/bus-stop/model/use-nearby-bus-stops';
import {
  getVisibleBusStopTiles,
  haveSameTiles,
  type BusStopTile,
} from '@/features/bus-stop/model/bus-stop-tile';
import { useBusRouteDetail } from '@/features/bus-stop/model/use-bus-route-detail';
import {
  isRouteBusStop,
  getRouteStopOccurrence,
  type RouteSheetSnap,
} from '@/features/bus-stop/model/bus-route-presentation';
import {
  isBusStopPlace,
  stationSearchName,
  matchesSearchFilter,
} from '@/features/mobility/model/place-kind';
import { searchPlaces, type Place, type Point } from '@/features/mobility/api/mobility';
import { useAppStore } from '@/shared/model/app-store';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useAppTheme } from '@/shared/ui';
import type { MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import type { MapViewRef } from '@/shared/ui/map/map-view';
import { usePlaceSearch, type SearchMapRequest } from '@/features/mobility/model/use-place-search';
import { useMapOverlays } from './use-map-overlays';
import { useInitialMapPosition } from './use-initial-map-position';

const EMPTY_SUBWAY_STATIONS: SubwayMapStation[] = [];

/**
 * 지도에 필요한 상태와 사용자 동작을 조립한다.
 * 서버 응답을 별도 상태에 복제하지 않고 Query의 데이터를 읽는다.
 * 선택한 정류장·노선 식별자와 시트 높이는 이 화면에서만 쓰는 일시적 UI 상태다.
 * @returns 지도 화면이 표시할 값과 클릭·카메라 이벤트 처리 함수.
 */
export function useMapController() {
  /** 지도와 버튼에 적용할 공통 라이트 테마 색상이다. */
  const { colors } = useAppTheme();
  const alertSelection = useAppStore((state) => state.alertSelection);
  const selectionZoom = alertSelection?.transport === 'subway' ? 15 : 16;

  /** 선택한 지하철 역 이름과 변경 함수다. null이면 지하철 시트를 닫는다. */
  const [subwayStation, setSubwayStation] = useState<string | null>(null);

  /** 같은 역의 환승 노선을 구분하는 선택 호선과 변경 함수다. */
  const [subwayLineName, setSubwayLineName] = useState<string | undefined>();

  /** 지도 심벌 좌표와 호선의 연결만 기억해 다른 심벌이 화면 밖으로 나가도 같은 역 선택을 유지한다. */
  const subwaySymbolMatches = useRef(new Map<string, string>());

  /** 지하철 시트의 현재 정착 높이와 변경 함수다. 최초에는 중간 높이로 연다. */
  const [subwaySheetSnap, setSubwaySheetSnap] = useState<MapSheetSnap>('half');

  /** 검색으로 선택한 장소와 변경 함수다. 장소 핀과 역의 실제 좌표에 사용한다. */
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  /** 검색 입력·결과 화면이 지도 위에 열려 있는지 나타낸다. */
  const [searchActive, setSearchActive] = useState(false);

  /** 알림을 눌러 진입할 때 Router가 넘긴 정류장 ID·좌표·알림 ID다. */
  const params = useLocalSearchParams<{
    stationId?: string;
    latitude?: string;
    longitude?: string;
    notificationId?: string;
    subwayStationName?: string;
    subwayLineName?: string;
    subwayLineId?: string;
    routeId?: string;
    stationSeq?: string;
  }>();

  /** 네이티브 지도 준비 완료 여부다. 준비되기 전에 알림 정류장으로 이동하지 않게 한다. */
  const [mapReady, setMapReady] = useState(false);

  /** 네이티브 지도 인스턴스에 카메라 명령을 전달한다. 인스턴스 교체만으로 화면을 다시 그릴 필요가 없어 ref를 사용한다. */
  const mapRef = useRef<MapViewRef>(null);
  const [selectedSearchResultId, setSelectedSearchResultId] = useState<string | null>(null);
  const [searchMapRequest, setSearchMapRequest] = useState<SearchMapRequest | null>(null);
  const search = usePlaceSearch(
    searchMapRequest?.query ?? '',
    searchMapRequest?.position ?? { latitude: 0, longitude: 0 },
    Boolean(searchMapRequest),
  );
  const mapSearchResults = useMemo(
    () =>
      search.results.filter((place) =>
        matchesSearchFilter(place, searchMapRequest?.filter ?? 'all'),
      ),
    [search.results, searchMapRequest?.filter],
  );
  const fittedSearch = useRef('');

  /** 늦게 도착한 장소·정류장 응답이 최신 선택을 덮어쓰지 않도록 요청 세대를 저장한다. 렌더링 값이 아니므로 ref다. */
  const selectionRequest = useRef(0);

  /** 정류장·장소 조회 결과를 다른 화면과 공유하고 재사용하는 Query 클라이언트다. */
  const queryClient = useQueryClient();

  /** 네이티브 준비 이벤트가 반복되어도 초기화 처리를 중복 실행하지 않도록 기억한다. 표시 여부는 별도의 mapReady state가 담당한다. */
  const initializedRef = useRef(false);

  /** 현재 지도 범위에서 관찰할 정류장 타일 식별자다. 정류장 응답 자체는 Query가 보관한다. */
  const [busStopTiles, setBusStopTiles] = useState<BusStopTile[] | null>(null);

  /** 이동이 끝난 지도의 줌과 범위다. 화면에 보이는 정류장·노선 방향 화살표 계산에 사용한다. */
  const [directionCamera, setDirectionCamera] = useState<{
    zoom: number;
    region: Parameters<typeof getVisibleBusStopTiles>[1];
  } | null>(null);

  /** 목록 시트에서 표시할 선택 정류장이다. null이면 정류장 시트를 표시하지 않는다. */
  const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);
  /** 네이버 심벌에서 확인한 표시 좌표만 보관하며 도착정보용 서버 좌표는 바꾸지 않는다. */
  const [selectedBusStopPoint, setSelectedBusStopPoint] = useState<Point | null>(null);
  const busStopSymbolPositions = useRef(new Map<string, Point>());
  const [visibleMapSymbols, setVisibleMapSymbols] = useState<MapSymbol[]>([]);

  /** 정류장 목록 대신 선택 노선의 상세 시트를 표시할지 결정한다. */
  const [showRouteSheet, setShowRouteSheet] = useState(false);

  /** 선택 노선의 정류장·노선 ID와 경유 순번이다. 왕복 노선의 같은 정류장도 순번으로 구분한다. */
  const [selectedRoute, setSelectedRoute] = useState<{
    stationId: string;
    routeId: string;
    stationSeq: number;
    source?: BusArrival['routeSource'];
  } | null>(null);

  /** 노선 상세 시트의 정착 높이와 변경 함수다. */
  const [routeSheetSnap, setRouteSheetSnap] = useState<RouteSheetSnap>('half');

  /** 시트가 덮는 높이다. 지도 패딩과 현재 위치 버튼의 세로 배치를 맞춘다. */
  const [sheetHeight, setSheetHeight] = useState(0);
  /** 내 위치를 누른 순간의 가림 높이만 지도에 적용하며 드래그 중에는 유지한다. */
  const [locationViewport, setLocationViewport] = useState<{
    selection: string;
    bottom: number;
  } | null>(null);
  const viewportSelection = selectedBusStop?.id ?? selectedPlace?.id ?? '';
  const locationBottomPadding =
    locationViewport?.selection === viewportSelection ? locationViewport.bottom : null;

  /** 지도 선택 상태에 따라 앱 공통 탭 숨김 값을 바꾸는 함수다. */
  const setMapTabHidden = useAppStore((state) => state.setMapTabHidden);

  /** 권한을 확인해 위치를 읽는 함수, 조회 중 상태, 마지막 좌표를 위치 훅에서 받는다. */
  const { getCurrentLocation, loading, position } = useCurrentLocation();

  /** 지도를 최초 생성할 좌표, 준비 중 상태, 실패 후 재시도 함수를 받는다. */
  const { initialPosition, preparingLocation, prepareInitialPosition } = useInitialMapPosition(
    params,
    getCurrentLocation,
  );

  const centeredAlertRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!mapReady || !initialPosition || !alertSelection) return;
    if (centeredAlertRequest.current === alertSelection.requestId) return;
    centeredAlertRequest.current = alertSelection.requestId;
    let cancelled = false;
    const request = selectionRequest.current;
    void getCurrentLocation().then((coordinate) => {
      if (cancelled || !coordinate || request !== selectionRequest.current) return;
      mapRef.current?.animateCameraTo({
        ...coordinate,
        zoom: alertSelection.transport === 'subway' ? 14 : 16,
        duration: 500,
      });
    });
    return () => {
      cancelled = true;
      centeredAlertRequest.current = null;
    };
  }, [mapReady, initialPosition, alertSelection, getCurrentLocation]);

  /** 화면 범위가 오기 전에는 초기 위치 주변 타일을 Query 입력으로 사용한다. */
  const initialBusStopTiles = useMemo(
    () =>
      initialPosition
        ? getVisibleBusStopTiles(17, {
            ...initialPosition,
            latitudeDelta: 0,
            longitudeDelta: 0,
          })
        : [],
    [initialPosition],
  );

  /** 현재 관찰하는 타일들의 Query 응답을 합친 정류장 목록이다. */
  const busStops = useNearbyBusStops(busStopTiles ?? initialBusStopTiles);

  /** 노치·상태 표시줄·홈 인디케이터를 피하기 위한 기기 안전 영역 여백이다. */
  const insets = useSafeAreaInsets();

  /** 선택 노선의 공식 형상·경유 정류장·차량 정보를 가진 Query 응답이다. */
  const { data: routeDetail } = useBusRouteDetail(
    selectedRoute?.stationId ?? '',
    selectedRoute?.routeId ?? '',
    selectedRoute?.stationSeq ?? 0,
    Boolean(selectedRoute),
    selectedRoute?.source,
  );

  /** 네이티브 지도에 전달할 마커·선과 클릭 매칭에 사용할 노선 정류장을 계산 훅에서 받는다. */
  const { data: subwayStops = EMPTY_SUBWAY_STATIONS } = useSubwayMapStations();
  const { markers, lines, routeStops, searchSymbolPositions } = useMapOverlays({
    subwaySelection: alertSelection?.transport === 'subway',
    busStops,
    selectedBusStop,
    selectedBusStopPoint,
    visibleMapSymbols,
    selectedRoute,
    routeDetail,
    directionCamera,
    selectedPlace,
    searchResults: mapSearchResults,
    selectedSearchId: searchMapRequest ? selectedSearchResultId : null,
    searchBusStops: search.stations.data ?? [],
    subwayStops,
    subwayStation,
    subwayLineName,
  });

  /** 검색 상위 10곳의 범위를 한 번 맞추며 시트 드래그·심벌 갱신에는 카메라를 다시 움직이지 않는다. */
  useEffect(() => {
    if (!searchMapRequest) {
      fittedSearch.current = '';
      return;
    }
    const results = mapSearchResults.slice(0, 10);
    if (!results.length || search.places.isPending || search.stations.isPending) return;
    const key = `${searchMapRequest.query}:${searchMapRequest.filter}:${searchMapRequest.position.latitude}:${searchMapRequest.position.longitude}:${results.map((place) => place.id).join('|')}`;
    if (fittedSearch.current === key) return;
    fittedSearch.current = key;
    const points = results.map((place) => searchSymbolPositions.get(place.id) ?? place);
    if (points.length === 1) {
      mapRef.current?.animateCameraTo({ ...points[0], zoom: selectionZoom, duration: 350 });
      return;
    }
    const south = Math.min(...points.map((point) => point.latitude));
    const north = Math.max(...points.map((point) => point.latitude));
    const west = Math.min(...points.map((point) => point.longitude));
    const east = Math.max(...points.map((point) => point.longitude));
    const latitudeMargin = Math.max((north - south) * 0.1, 0.0007);
    const longitudeMargin = Math.max((east - west) * 0.1, 0.0007);
    mapRef.current?.animateCameraWithTwoCoords({
      coord1: { latitude: south - latitudeMargin, longitude: west - longitudeMargin },
      coord2: { latitude: north + latitudeMargin, longitude: east + longitudeMargin },
      duration: 350,
    });
  }, [
    searchMapRequest,
    mapSearchResults,
    search.places.isPending,
    search.stations.isPending,
    searchSymbolPositions,
    selectionZoom,
  ]);

  /** 지도 화면을 떠날 때 탭 숨김을 해제한다. 변경 함수가 바뀌면 정리 함수를 다시 등록한다. */
  useEffect(() => () => setMapTabHidden(false), [setMapTabHidden]);

  /** 검색 활성·정류장·지하철 선택이 바뀔 때 탭 숨김 여부를 맞춘다. 파생 UI를 공용 레이아웃과 동기화한다. */
  useEffect(() => {
    setMapTabHidden(
      Boolean(alertSelection) || searchActive || Boolean(subwayStation || selectedBusStop),
    );
  }, [alertSelection, searchActive, subwayStation, selectedBusStop, setMapTabHidden]);

  /** 정류장·역 선택이 바뀔 때만 중앙으로 옮기며 시트 높이 변경에는 반응하지 않는다. */
  useEffect(() => {
    const target =
      (selectedBusStop ? (selectedBusStopPoint ?? selectedBusStop) : null) ??
      (subwayStation || !searchActive ? selectedPlace : null);
    if (!target || !initializedRef.current) return;
    const frame = requestAnimationFrame(() => {
      mapRef.current?.animateCameraTo({
        latitude: target.latitude,
        longitude: target.longitude,
        ...(subwayStation || alertSelection ? { zoom: selectionZoom } : {}),
        duration: 320,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    selectedBusStop,
    selectedBusStopPoint,
    selectedPlace,
    searchActive,
    subwayStation,
    alertSelection,
    selectionZoom,
  ]);

  /** 진행 중인 선택 요청을 무효화하고 정류장 시트와 지도 하단 여백을 닫는다. 시트에 넘기는 함수 참조를 유지하기 위해 useCallback을 쓴다. */
  const closeBusStop = useCallback(() => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedBusStop(null);
    setSheetHeight(0);
  }, []);

  /** 지하철·장소 선택을 해제하고 선택한 정류장의 버스 목록을 연다. 여러 지도 이벤트에서 공유하는 선택 동작이다. */
  const selectBusStop = useCallback(
    (busStop: BusStop, point?: Point) => {
      if (alertSelection?.transport === 'subway') return;
      setSubwayStation(null);
      setSelectedPlace(null);
      selectionRequest.current++;
      setShowRouteSheet(false);
      setSelectedRoute(null);
      setSelectedBusStop(busStop);
      if (point) busStopSymbolPositions.current.set(busStop.id, point);
      setSelectedBusStopPoint(point ?? busStopSymbolPositions.current.get(busStop.id) ?? null);
    },
    [alertSelection?.transport],
  );

  /** 검색 장소로 카메라를 옮기고 정류장 장소라면 가까운 서버 정류장과 이름을 대조한다. Query 캐시를 재사용하며 최신 요청만 선택에 반영한다. */
  const selectPlace = useCallback(
    async (place: Place | null, showBusStop = false) => {
      /** 이 비동기 선택을 시작한 시점의 세대 번호다. 응답 시 현재 번호와 다르면 결과를 버린다. */
      const request = ++selectionRequest.current;
      setSubwayStation(null);
      const point = place ? searchSymbolPositions.get(place.id) : undefined;
      const displayedPlace = place && point ? { ...place, ...point } : place;
      setSelectedPlace(displayedPlace);
      if (!place) {
        setSheetHeight(0);
        return;
      }
      setShowRouteSheet(false);
      setSelectedRoute(null);
      setSelectedBusStop(null);
      setSheetHeight(0);
      mapRef.current?.animateCameraTo({
        ...(displayedPlace ?? place),
        zoom: selectionZoom,
        duration: 350,
      });
      if (!showBusStop || !isBusStopPlace(place)) return;
      const exact = search.stations.data?.find((stop) => `station:${stop.id}` === place.id);
      if (exact) {
        selectBusStop(exact, point);
        return;
      }
      try {
        /** 선택한 장소나 노선 정류장의 좌표 주변에서 Query로 조회한 정류장 후보들이다. */
        const nearby = await queryClient.fetchQuery({
          queryKey: ['bus-stops', 'place', place.id, place.latitude, place.longitude],
          queryFn: ({ signal }) => getNearbyBusStops({ ...place, radius: 120, signal }),
          staleTime: 30 * 60_000,
        });
        if (request !== selectionRequest.current) return;

        /** 장소·역 이름에서 불필요한 표기를 제거한 비교용 이름이다. */
        const name = stationSearchName(place.name);

        /** 이름이 일치하거나 포함 관계인 주변 정류장을 거리순으로 정렬한 후보들이다. */
        const matches = nearby
          .filter((stop) => {
            /** 검색 장소 이름과 대조하기 위해 정리한 후보 정류장 이름이다. */
            const other = stationSearchName(stop.name);
            return (
              other === name ||
              (name.length >= 3 &&
                other.length >= 3 &&
                (other.includes(name) || name.includes(other)))
            );
          })
          .sort((a, b) => a.distanceMeters - b.distanceMeters);
        if (matches[0]) selectBusStop(matches[0]);
      } catch {
        if (request === selectionRequest.current)
          Alert.alert(
            '정류장 버스 목록을 불러오지 못했어요',
            '잠시 후 정류장을 다시 선택해주세요.',
          );
      }
    },
    [queryClient, selectBusStop, searchSymbolPositions, search.stations.data, selectionZoom],
  );

  /** 검색 시작 시 기존 정류장·노선·지하철 시트를 정리한다. 하위 검색 화면에 동일한 콜백을 전달한다. */
  const activateSearch = useCallback(() => {
    setSubwayStation(null);
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedRoute(null);
    setSelectedBusStop(null);
    setSheetHeight(0);
  }, []);

  /** 알림 대상 선택은 이전 검색·노선 문맥을 이어받지 않는다. */
  const resetAlertMapSelection = useCallback(() => {
    selectionRequest.current++;
    setSubwayStation(null);
    setSubwayLineName(undefined);
    setSelectedPlace(null);
    setSelectedBusStop(null);
    setSelectedBusStopPoint(null);
    setSelectedRoute(null);
    setShowRouteSheet(false);
    setSearchMapRequest(null);
    setSelectedSearchResultId(null);
    setSearchActive(false);
    setSheetHeight(0);
    setLocationViewport(null);
  }, []);
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        if (
          state.alertSelection?.requestId &&
          state.alertSelection.requestId !== previous.alertSelection?.requestId
        ) {
          resetAlertMapSelection();
        }
      }),
    [resetAlertMapSelection],
  );

  const onSearchActiveChange = useCallback((active: boolean) => {
    setSearchActive(active);
  }, []);

  /** 알림으로 연 정류장을 서버 데이터로 선택하고 해당 좌표로 지도를 이동한다. */
  useEffect(() => {
    if (!mapReady || !params.notificationId || !params.stationId) return;

    /** 알림 URL의 문자열 좌표를 숫자로 바꾼 값이다. 유효 범위를 확인한 뒤 사용한다. */
    const latitude = Number(params.latitude),
      longitude = Number(params.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return;

    /** 알림 파라미터가 바뀌거나 화면이 정리될 때 이전 정류장 요청을 취소하는 제어기다. */
    const abort = new AbortController();
    void queryClient
      .fetchQuery({
        queryKey: ['bus-stops', 'notification', params.stationId],
        queryFn: () =>
          getNearbyBusStops({
            latitude,
            longitude,
            radius: 100,
            signal: abort.signal,
          }),
        staleTime: 30 * 60_000,
      })
      .then((stops) => {
        if (abort.signal.aborted) return;

        /** 클릭한 마커 ID 또는 알림 정류장 ID와 일치하는 정류장 후보다. */
        const stop = stops.find(
          (item) => item.id === params.stationId || item.stationIds?.includes(params.stationId!),
        );
        if (!stop) throw new Error('알림의 정류장을 찾을 수 없습니다.');
        setSelectedRoute(null);
        selectBusStop(stop);
        const stationSeq = Number(params.stationSeq);
        if (params.routeId && Number.isInteger(stationSeq) && stationSeq > 0) {
          setSelectedRoute({ stationId: params.stationId!, routeId: params.routeId, stationSeq });
          setShowRouteSheet(true);
          setRouteSheetSnap('half');
        }
        mapRef.current?.animateCameraTo({
          latitude,
          longitude,
          zoom: 17,
          duration: 350,
        });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          Alert.alert(
            '정류장을 열 수 없습니다',
            error instanceof Error ? error.message : '서버 연결을 확인해주세요.',
          );
      });
    return () => abort.abort();
  }, [
    mapReady,
    params.notificationId,
    params.stationId,
    params.latitude,
    params.longitude,
    params.routeId,
    params.stationSeq,
    selectBusStop,
    queryClient,
  ]);

  /** 다른 정류소의 전체 버스 목록을 열고 기존 노선 선과 상세 선택을 해제한다. */
  const selectRouteStop = useCallback(
    async (stop: BusRouteDetail['stops'][number], point?: Point) => {
      if (!selectedRoute || !routeDetail) return;

      /** 이 비동기 선택을 시작한 시점의 세대 번호다. 응답 시 현재 번호와 다르면 결과를 버린다. */
      const request = ++selectionRequest.current;

      /** 선택 정류장이 현재 노선에서 나타나는 경유 항목이다. 왕복·순환 중 어떤 순번인지 확인한다. */
      const occurrence = getRouteStopOccurrence(routeDetail.stops, stop.stationId, stop.stationSeq);
      if (!occurrence) return;
      mapRef.current?.animateCameraTo({
        latitude: point?.latitude ?? stop.latitude,
        longitude: point?.longitude ?? stop.longitude,
        zoom: 16,
        duration: 250,
      });
      try {
        /** 현재 캐시에서 찾거나 주변 조회로 보완할 노선 정류장의 서버 정보다. */
        let station = busStops.find((item) => isRouteBusStop(item, [stop]));
        if (!station) {
          /** 선택한 장소나 노선 정류장의 좌표 주변에서 Query로 조회한 정류장 후보들이다. */
          const nearby = await queryClient.fetchQuery({
            queryKey: ['bus-stops', 'route-stop', stop.stationId],
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
        if (!station) throw new Error('선택한 정류소의 서버 정보를 찾을 수 없습니다.');
        setSelectedBusStop(station);
        if (point) busStopSymbolPositions.current.set(station.id, point);
        setSelectedBusStopPoint(point ?? busStopSymbolPositions.current.get(station.id) ?? null);
        setSelectedRoute(null);
        setShowRouteSheet(false);
        setRouteSheetSnap('half');
      } catch (error) {
        if (request !== selectionRequest.current) return;
        Alert.alert(
          '정류소를 열 수 없습니다',
          error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.',
        );
      }
    },
    [busStops, queryClient, selectedRoute, routeDetail],
  );

  /** 노선 지도에서 돌아가면 원래 선택한 정류장 목록을 다시 보여 준다. */
  const closeRoute = useCallback(() => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedRoute(null);
    setRouteSheetSnap('half');
  }, []);

  /**
   * 보이는 타일이 바뀐 경우에만 조회 대상을 갱신한다.
   * @param zoom 정류장 노출 여부와 타일 크기를 결정할 지도 줌.
   * @param region 지도 화면의 지리적 범위.
   */
  const updateVisibleTiles = useCallback(
    (zoom: number | undefined, region: Parameters<typeof getVisibleBusStopTiles>[1]) => {
      if (zoom !== undefined) setDirectionCamera({ zoom, region });

      /** 새 지도 범위와 줌에 필요한 타일 목록이다. 기존 목록과 같으면 상태를 갱신하지 않는다. */
      const nextTiles = getVisibleBusStopTiles(
        zoom,
        region,
        zoom !== undefined && zoom >= 16 ? 2 : 1,
      );
      if (nextTiles.length === 0 && !selectedRoute) closeBusStop();
      setBusStopTiles((currentTiles) =>
        currentTiles && haveSameTiles(currentTiles, nextTiles) ? currentTiles : nextTiles,
      );
    },
    [closeBusStop, selectedRoute],
  );

  /** 지도 초기화와 위치 조회가 모두 끝난 경우에만 현재 좌표로 이동한다. */
  const moveToMyLocation = useCallback(async () => {
    if (!initializedRef.current) return;

    /** 위치 훅이 권한·정확도를 확인해 반환한 현재 좌표다. 실패한 경우 null이다. */
    const coordinate = await getCurrentLocation();
    if (!coordinate) return;

    setLocationViewport({
      selection: viewportSelection,
      bottom: sheetHeight > 0 ? sheetHeight + insets.bottom + 8 : 0,
    });
    // 실제 시트 높이에 맞는 지도 패딩을 먼저 반영한 뒤 남은 영역의 중앙으로 이동한다.
    requestAnimationFrame(() => {
      mapRef.current?.animateCameraTo({
        ...coordinate,
        zoom: alertSelection?.transport === 'subway' ? 14 : 17,
        duration: 500,
      });
    });
  }, [
    getCurrentLocation,
    sheetHeight,
    insets.bottom,
    viewportSelection,
    alertSelection?.transport,
  ]);

  /** 네이티브 지도 이동이 끝난 영역만 정류장 타일 조회로 전달한다. 이동 중 매 프레임 서버를 호출하지 않는다. */
  const onCameraIdle = useCallback(
    ({
      zoom,
      region,
      symbols,
    }: {
      zoom?: number;
      region: Parameters<typeof getVisibleBusStopTiles>[1];
      symbols: MapSymbol[];
    }) => {
      // 이전 화면의 출구·상점 심벌을 정류장 후보로 재사용하지 않는다.
      setVisibleMapSymbols(symbols);
      updateVisibleTiles(zoom, region);
    },
    [updateVisibleTiles],
  );

  /** 지도 준비 완료를 최초 한 번 반영한다. React 화면용 state와 명령 가능 여부를 확인하는 ref를 함께 갱신한다. */
  const onMapInitialized = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setMapReady(true);
  }, []);

  /** 현재 마커가 선택된 노선의 정류장이면 노선 문맥을 유지하고, 아니면 일반 정류장 목록을 연다. */
  const selectSelectedStop = useCallback(
    (station: BusStop) => {
      /** 현재 선택한 정류장이 노선 상세에도 포함되는지 확인한 경유 항목이다. */
      const routeStop = selectedRoute && routeStops.find((stop) => isRouteBusStop(station, [stop]));
      if (routeStop)
        void selectRouteStop(routeStop, busStopSymbolPositions.current.get(station.id));
      else selectBusStop(station);
    },
    [selectedRoute, routeStops, selectRouteStop, selectBusStop],
  );

  /** 정류장 목록에서 고른 노선과 정류장 순번을 저장하고 노선 시트를 중간 높이로 연다. */
  const selectBusRoute = useCallback(
    (routeId: string, stationSeq: number, source?: BusArrival['routeSource']) => {
      if (!selectedBusStop) return;
      if (selectedRoute?.routeId === routeId) {
        selectionRequest.current++;
        setSelectedRoute(null);
        setShowRouteSheet(false);
        setRouteSheetSnap('half');
        return;
      }
      setSelectedRoute({ stationId: selectedBusStop.id, routeId, stationSeq, source });
      setShowRouteSheet(true);
      setRouteSheetSnap('half');
    },
    [selectedBusStop, selectedRoute],
  );

  /** 지하철 선택 요청을 무효화하고 지하철 시트와 하단 지도 여백을 닫는다. */
  const closeSubway = useCallback(() => {
    selectionRequest.current++;
    setSubwayStation(null);
    setSelectedPlace((place) => (place?.id.startsWith('subway:') ? null : place));
    setSheetHeight(0);
  }, []);

  /** 역·호선에 맞는 실제 장소 좌표를 Query로 조회해 선택하고 카메라를 이동한다. 먼저 시작한 검색이 나중 선택을 덮어쓰지 않게 세대를 확인한다. */
  const selectSubwayStation = useCallback(
    async (name: string, lineName: string, point?: Point) => {
      if (alertSelection?.transport === 'bus') return;
      /** 이 비동기 선택을 시작한 시점의 세대 번호다. 응답 시 현재 번호와 다르면 결과를 버린다. */
      const request = ++selectionRequest.current;
      try {
        /** 역 장소 검색의 거리 기준점이다. 선택 장소가 없으면 최초 현재 위치를 사용한다. */
        const near = selectedPlace ?? initialPosition;
        if (!near) return;

        /** 역 좌표가 직접 제공되지 않을 때 Query로 검색한 장소 후보 목록이다. */
        const places = point
          ? []
          : await queryClient.fetchQuery({
              queryKey: ['mobility', 'subway-place', name, lineName],
              queryFn: ({ signal }) => searchPlaces(`${name}역`, near, signal),
              staleTime: 30 * 60_000,
            });
        if (request !== selectionRequest.current) return;

        /** 역 선택에 전달할 실제 장소 좌표와 표시 이름이다. */
        const place = point
          ? {
              ...point,
              id: `subway:${lineName}:${name}`,
              name: `${name}역`,
              address: '',
              category: '지하철역',
              distanceMeters: null,
            }
          : (places.find(
              (item) => item.name.startsWith(`${name}역`) && item.name.includes(lineName),
            ) ??
            places.find(
              (item) => item.name.startsWith(`${name}역`) && /지하철|전철/.test(item.category),
            ));
        if (!place) throw new Error('역 위치 없음');
        setSelectedPlace(place);
        setSubwaySheetSnap('half');
        setSubwayStation(name);
        setSubwayLineName(lineName);
      } catch {
        if (request === selectionRequest.current)
          Alert.alert('역 위치를 확인하지 못했어요', '다시 선택해주세요.');
      }
    },
    [alertSelection?.transport, selectedPlace, initialPosition, queryClient],
  );

  /** 검색 캐시가 없는 최근 기록도 공식 대상 ID를 다시 확인해 알림 선택으로 연결한다. */
  const selectSearchResult = useCallback(
    async (place: Place) => {
      if (alertSelection?.transport === 'bus' && !place.id.startsWith('station:')) return;
      if (alertSelection?.transport === 'subway' && !place.id.startsWith('subway:')) return;
      const request = ++selectionRequest.current;
      try {
        const point = searchSymbolPositions.get(place.id);
        if (place.id.startsWith('station:')) {
          const id = place.id.slice('station:'.length);
          const matches = (item: BusStop) => item.id === id || item.stationIds?.includes(id);
          let stop =
            search.stations.data?.find(matches) ??
            queryClient
              .getQueriesData<BusStop[]>({ queryKey: ['bus-stops', 'search'] })
              .flatMap(([, stops]) => stops ?? [])
              .find(matches);
          if (!stop) {
            const nearby = await queryClient.fetchQuery({
              queryKey: ['bus-stops', 'place', place.id, place.latitude, place.longitude],
              queryFn: ({ signal }) => getNearbyBusStops({ ...place, radius: 120, signal }),
              staleTime: 30 * 60_000,
            });
            if (request !== selectionRequest.current) return;
            stop = nearby.find(matches);
          }
          if (!stop) throw new Error('저장된 정류장을 찾지 못했어요. 다시 검색해주세요.');
          setSelectedSearchResultId(place.id);
          selectBusStop(stop, point);
        } else if (place.id.startsWith('subway:')) {
          const stations = subwayStops.length
            ? subwayStops
            : await queryClient.fetchQuery({
                queryKey: ['subway', 'map-stations'],
                queryFn: ({ signal }) => getSubwayMapStations(signal),
                staleTime: 86_400_000,
              });
          if (request !== selectionRequest.current) return;
          const station = stations.find((item) => `subway:${item.id}` === place.id);
          if (!station) throw new Error('저장된 지하철역을 찾지 못했어요. 다시 검색해주세요.');
          setSelectedSearchResultId(place.id);
          setSelectedBusStop(null);
          setSelectedRoute(null);
          setShowRouteSheet(false);
          setSelectedPlace(point ? { ...place, ...point } : place);
          setSubwayStation(station.name.replace(/역$/, ''));
          setSubwayLineName(station.lineName);
          setSubwaySheetSnap('half');
        } else return;
        mapRef.current?.animateCameraTo({
          ...(point ?? place),
          zoom: selectionZoom,
          duration: 350,
        });
      } catch (error) {
        if (request !== selectionRequest.current) return;
        Alert.alert(
          '선택한 위치를 확인하지 못했어요',
          error instanceof Error ? error.message : '다시 검색해주세요.',
        );
      }
    },
    [
      searchSymbolPositions,
      search.stations.data,
      selectBusStop,
      subwayStops,
      queryClient,
      alertSelection?.transport,
      selectionZoom,
    ],
  );

  /** 역 이름의 괄호·역 접미어를 정리해 지하철 시트를 연다. 저장된 역처럼 좌표가 없을 때만 실제 장소 조회를 요청한다. */
  const openSubway = useCallback(
    (stationName: string, savedLine?: string) => {
      /** 장소·역 이름에서 불필요한 표기를 제거한 비교용 이름이다. */
      const name = stationName
        .replace(/\[[^\]]*\]/g, '')
        .trim()
        .replace(/역$/, '')
        .trim();
      if (!name) return;

      /** 저장된 호선 또는 역 이름의 괄호에서 추출한 호선 이름이다. */
      const lineName = savedLine ?? stationName.match(/\[([^\]]+)\]/)?.[1];
      activateSearch();
      setSubwaySheetSnap('half');
      setSubwayLineName(lineName);
      setSubwayStation(name);
      if (
        !selectedPlace ||
        !(selectedPlace.name === name || selectedPlace.name.startsWith(`${name}역`))
      ) {
        setSelectedPlace(null);
        void selectSubwayStation(name, lineName ?? '');
      }
    },
    [activateSearch, selectedPlace, selectSubwayStation],
  );

  const lastNotification = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (
      !mapReady ||
      !params.notificationId ||
      !params.subwayStationName ||
      lastNotification.current === params.notificationId
    )
      return;
    lastNotification.current = params.notificationId;
    openSubway(params.subwayStationName, params.subwayLineName || undefined);
  }, [
    mapReady,
    params.notificationId,
    params.subwayStationName,
    params.subwayLineName,
    params.subwayLineId,
    openSubway,
  ]);

  /** 심벌 이름과 실제 거리를 함께 대조해 누른 정류장을 바로 연다. */
  const selectBusStopSymbol = useCallback(
    async (symbol: Point & { caption: string; peers?: Point[] }) => {
      if (alertSelection?.transport === 'subway') return;
      const request = ++selectionRequest.current;
      const point = { latitude: symbol.latitude, longitude: symbol.longitude };
      const name = stationSearchName(symbol.caption);
      const distanceToSymbol = (stop: Point) =>
        Math.hypot(
          stop.latitude - point.latitude,
          (stop.longitude - point.longitude) * Math.cos((point.latitude * Math.PI) / 180),
        ) * 111_320;
      try {
        const nearby = await queryClient.fetchQuery({
          queryKey: [
            'bus-stops',
            'naver-symbol-source-positions',
            symbol.caption,
            point.latitude,
            point.longitude,
          ],
          queryFn: ({ signal }) => getNearbyBusStops({ ...point, radius: 300, signal }),
          staleTime: 30 * 60_000,
        });
        if (request !== selectionRequest.current) return;
        const number = symbol.caption.match(/(?:^|\D)(\d{5})(?:\D|$)/)?.[1];
        // 같은 화면의 심벌을 함께 배정해야 여러 마커가 최근접 정류장 하나로 몰리지 않는다.
        const peers = (symbol.peers ?? [])
          .filter((peer) => distanceToSymbol(peer) <= 150)
          .sort((a, b) => distanceToSymbol(a) - distanceToSymbol(b))
          .slice(0, 39);
        const symbols = [symbol, ...peers.map((peer) => ({ ...peer, caption: symbol.caption }))];
        const linked = matchBusStopSymbols(symbols, nearby).get(busSymbolKey(point));
        const matches = number
          ? nearby
              .filter((stop) => [stop.arsId, ...(stop.arsIds ?? [])].includes(number))
              .sort((a, b) => distanceToSymbol(a) - distanceToSymbol(b))
          : linked
            ? [linked]
            : [];
        // 지도 표기와 DB 좌표가 달라도 정류장 번호로 같은 승강장을 찾는다.
        if (!matches.length && (number || name)) {
          const searched = await queryClient.fetchQuery({
            queryKey: [
              'bus-stops',
              'symbol-search-source-positions',
              number ?? name,
              point.latitude,
              point.longitude,
            ],
            queryFn: ({ signal }) => searchBusStops(number ?? name, point, signal),
            staleTime: 30 * 60_000,
          });
          if (request !== selectionRequest.current) return;
          if (number) {
            matches.push(
              ...searched
                .filter(
                  (stop) =>
                    [stop.arsId, ...(stop.arsIds ?? [])].includes(number) &&
                    distanceToSymbol(stop) <= 500,
                )
                .sort((a, b) => distanceToSymbol(a) - distanceToSymbol(b)),
            );
          } else {
            const match = matchBusStopSymbols(symbols, [...nearby, ...searched]).get(
              busSymbolKey(point),
            );
            if (match) matches.push(match);
          }
        }
        const choose = (stop: BusStop) => {
          if (request !== selectionRequest.current) return;
          const routeStop =
            selectedRoute && routeStops.find((item) => isRouteBusStop(stop, [item]));
          if (routeStop) void selectRouteStop(routeStop, point);
          else selectBusStop(stop, point);
        };
        if (matches[0]) choose(matches[0]);
        else {
          Alert.alert('정류장을 찾지 못했어요', '주변 정류장 정보를 확인할 수 없습니다.');
        }
      } catch {
        if (request === selectionRequest.current)
          Alert.alert('정류장 정보를 불러오지 못했어요', '잠시 후 정류장을 다시 선택해주세요.');
      }
    },
    [
      alertSelection?.transport,
      queryClient,
      selectedRoute,
      routeStops,
      selectRouteStop,
      selectBusStop,
    ],
  );

  /** 지하철은 호선과 연결하고 버스는 네이버 심벌의 실제 위치에서 도착정보를 연다. */
  const onSymbolPress = useCallback(
    async (symbol: Point & { caption: string; peers: Point[] }) => {
      const statedLine = symbol.caption.match(/(?:수도권)?(\d+호선)/)?.[1];
      const searchMatch = mapSearchResults.find((place) => {
        const point = searchSymbolPositions.get(place.id);
        return (
          point &&
          busSymbolKey(point) === busSymbolKey(symbol) &&
          (!statedLine || place.subwayLineName === statedLine)
        );
      });
      if (searchMatch) {
        selectSearchResult(searchMatch);
        return;
      }
      if (/(?:^|\D)\d{5}(?:\D|$)|버스정류/.test(symbol.caption)) {
        void selectBusStopSymbol(symbol);
        return;
      }
      const request = ++selectionRequest.current;
      let stationsData = subwayStops;
      if (!stationsData.length) {
        try {
          stationsData = await queryClient.fetchQuery({
            queryKey: ['subway', 'map-stations'],
            queryFn: ({ signal }) => getSubwayMapStations(signal),
            staleTime: 86_400_000,
          });
        } catch {
          if (request === selectionRequest.current)
            Alert.alert('지도 정보를 불러오지 못했어요', '잠시 후 다시 선택해주세요.');
          return;
        }
      }
      if (request !== selectionRequest.current) return;
      const caption = symbol.caption.replace(/\s/g, '');
      const symbolLine = caption.match(/(?:수도권)?(\d+)호선/)?.[1];
      const namedLine = stationsData.find(
        (station) => !/^\d+호선$/.test(station.lineName) && caption.includes(station.lineName),
      )?.lineName;
      const explicitLine = symbolLine ? `${symbolLine}호선` : namedLine;
      const candidates = stationsData
        .filter(
          (station) =>
            (caption.includes(`${station.name.replace(/역$/, '')}역`) ||
              caption.replace(/(?:수도권)?\d+호선/g, '').replace(/[()[\]]/g, '') ===
                station.name.replace(/역$/, '')) &&
            (!explicitLine || station.lineName === explicitLine),
        )
        .map((station) => ({
          station,
          distance: Math.hypot(
            station.latitude - symbol.latitude,
            (station.longitude - symbol.longitude) * Math.cos((symbol.latitude * Math.PI) / 180),
          ),
        }))
        .filter((item) => item.distance < 0.003)
        .sort((a, b) => a.distance - b.distance);
      if (!candidates.length) {
        if (explicitLine) return;
        void selectBusStopSymbol(symbol);
        return;
      }
      const symbolKey = (point: Point) =>
        `${caption}:${point.latitude.toFixed(7)}:${point.longitude.toFixed(7)}`;
      const stations = candidates.map((item) => item.station);
      for (const peer of symbol.peers) {
        subwaySymbolMatches.current.delete(symbolKey(peer));
        const match = selectMapSubwayStation(peer, stations, symbol.peers);
        if (match) subwaySymbolMatches.current.set(symbolKey(peer), match.id);
      }
      const choose = (station: SubwayMapStation) => {
        if (alertSelection?.transport === 'bus') return;
        activateSearch();
        setSubwaySheetSnap('half');
        void selectSubwayStation(station.name, station.lineName, {
          latitude: symbol.latitude,
          longitude: symbol.longitude,
        });
      };
      const station =
        (explicitLine && stations.length === 1 ? stations[0] : undefined) ??
        stations.find((item) => item.id === subwaySymbolMatches.current.get(symbolKey(symbol))) ??
        selectMapSubwayStation(symbol, stations, symbol.peers);
      if (station) choose(station);
      else if (!explicitLine) void selectBusStopSymbol(symbol);
    },
    [
      alertSelection?.transport,
      subwayStops,
      queryClient,
      activateSearch,
      selectSubwayStation,
      selectBusStopSymbol,
      mapSearchResults,
      searchSymbolPositions,
      selectSearchResult,
    ],
  );

  /** 선택 핀을 다시 누르면 현재 노선 문맥을 유지해 정류장 목록을 연다. */
  const onMarkerPress = useCallback(
    (id: string) => {
      if (id.startsWith('search-result:')) {
        const place = mapSearchResults.find((item) => `search-result:${item.id}` === id);
        if (place) selectSearchResult(place);
        return;
      }
      if (id.startsWith('route-stop:')) {
        const stop = routeStops.find((item) => `route-stop:${item.stationId}` === id);
        const marker = markers.find((item) => item.id === id);
        if (stop && marker) void selectRouteStop(stop, marker);
        return;
      }
      if (
        selectedBusStop &&
        (id === `selected-stop:${selectedBusStop.id}` ||
          id === `selected-stop-base:${selectedBusStop.id}`)
      )
        selectSelectedStop(selectedBusStop);
    },
    [
      markers,
      routeStops,
      selectRouteStop,
      selectedBusStop,
      selectSelectedStop,
      mapSearchResults,
      selectSearchResult,
    ],
  );

  return {
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
    selectRouteStop,
    selectPlace,
    activateSearch,
    setSearchMapRequest,
    selectedSearchId: searchMapRequest ? selectedSearchResultId : null,
    selectSearchResult,
    searchMapActive: Boolean(searchMapRequest),
    openSubway,
    getCurrentLocation,
    onSearchActiveChange,
    subwayStation,
    subwaySheetSnap,
    subwayLineName,
    closeSubway,
    setSubwaySheetSnap,
    selectSubwayStation,
  };
}
