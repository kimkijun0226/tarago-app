/**
 * @fileoverview 지도 화면의 선택·전환을 조율하는 컨트롤러 훅.
 * 정류장·노선 Query와 검색 결과를 연결하고, 최신 선택만 반영하며 카메라와 시트를 함께 전환한다.
 * 오버레이 계산·GPS 권한·시트 내부 UI는 각 전용 모듈에 위임한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getNearbyBusStops, type BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
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
import { isBusStopPlace, stationSearchName } from '@/features/mobility/model/place-kind';
import { searchPlaces, type Place, type Point } from '@/features/mobility/api/mobility';
import { useAppStore } from '@/shared/model/app-store';
import { useCurrentLocation } from '@/hooks/use-current-location';
import { useAppTheme } from '@/shared/ui';
import type { MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import type { TmapViewRef } from '@/shared/ui/tmap/tmap-view';
import { useMapOverlays } from './use-map-overlays';
import { useInitialMapPosition } from './use-initial-map-position';

/**
 * 지도에 필요한 상태와 사용자 동작을 조립한다.
 * 서버 응답을 별도 상태에 복제하지 않고 Query의 데이터를 읽는다.
 * 선택한 정류장·노선 식별자와 시트 높이는 이 화면에서만 쓰는 일시적 UI 상태다.
 * @returns 지도 화면이 표시할 값과 클릭·카메라 이벤트 처리 함수.
 */
export function useMapController() {
  /** 지도와 버튼에 적용할 공통 라이트 테마 색상이다. */
  const { colors } = useAppTheme();

  /** 선택한 지하철 역 이름과 변경 함수다. null이면 지하철 시트를 닫는다. */
  const [subwayStation, setSubwayStation] = useState<string | null>(null);

  /** 같은 역의 환승 노선을 구분하는 선택 호선과 변경 함수다. */
  const [subwayLineName, setSubwayLineName] = useState<string | undefined>();

  /** 지하철 시트의 현재 정착 높이와 변경 함수다. 최초에는 중간 높이로 연다. */
  const [subwaySheetSnap, setSubwaySheetSnap] = useState<MapSheetSnap>('half');

  /** 역 상세에서 전달한 출발·도착 지정 요청이다. 요청 번호가 바뀌면 검색 화면에서 새 의도로 적용한다. */
  const [routeIntent, setRouteIntent] = useState<{
    id: number;
    place: Place;
    field: 'start' | 'end';
  }>();

  /** 동일한 장소를 연속해서 출발·도착으로 지정해도 서로 다른 요청으로 전달할 일련번호. 번호 자체는 화면에 표시하지 않아 ref로 유지한다. */
  const routeIntentRevision = useRef(0);

  /** 검색으로 선택한 장소와 변경 함수다. 장소 핀과 역의 실제 좌표에 사용한다. */
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);

  /** 선택한 길찾기 결과의 구간별 좌표 배열이다. 빈 배열이면 길찾기 선을 지운다. */
  const [journeyLines, setJourneyLines] = useState<Point[][]>([]);

  /** 검색·길찾기 화면이 지도 위에서 활성화됐는지 나타낸다. 현재 위치 버튼과 탭 노출에 사용한다. */
  const [planningActive, setPlanningActive] = useState(false);

  /** 지도에 출발·도착 마커를 표시할 장소 쌍이다. 경로 응답 전체를 복제하는 상태는 아니다. */
  const [journeyEndpoints, setJourneyEndpoints] = useState<{
    start: Place | null;
    end: Place | null;
  }>({ start: null, end: null });

  /** 알림을 눌러 진입할 때 Router가 넘긴 정류장 ID·좌표·알림 ID다. */
  const params = useLocalSearchParams<{
    stationId?: string;
    latitude?: string;
    longitude?: string;
    notificationId?: string;
  }>();

  /** 네이티브 지도 준비 완료 여부다. 준비되기 전에 알림 정류장으로 이동하지 않게 한다. */
  const [mapReady, setMapReady] = useState(false);

  /** 네이티브 지도 인스턴스에 카메라 명령을 전달한다. 인스턴스 교체만으로 화면을 다시 그릴 필요가 없어 ref를 사용한다. */
  const mapRef = useRef<TmapViewRef>(null);

  /** 늦게 도착한 장소·정류장 응답이 최신 선택을 덮어쓰지 않도록 요청 세대를 저장한다. 렌더링 값이 아니므로 ref다. */
  const selectionRequest = useRef(0);

  /** 정류장·장소 조회 결과를 다른 화면과 공유하고 재사용하는 Query 클라이언트다. */
  const queryClient = useQueryClient();

  /** 네이티브 준비 이벤트가 반복되어도 초기화 처리를 중복 실행하지 않도록 기억한다. 표시 여부는 별도의 mapReady state가 담당한다. */
  const initializedRef = useRef(false);

  /** 현재 지도 범위에서 관찰할 정류장 타일 식별자다. 정류장 응답 자체는 Query가 보관한다. */
  const [busStopTiles, setBusStopTiles] = useState<BusStopTile[]>([]);

  /** 이동이 끝난 지도의 줌과 범위다. 화면에 보이는 정류장·노선 방향 화살표 계산에 사용한다. */
  const [directionCamera, setDirectionCamera] = useState<{
    zoom: number;
    region: Parameters<typeof getVisibleBusStopTiles>[1];
  } | null>(null);

  /** 목록 시트에서 표시할 선택 정류장이다. null이면 정류장 시트를 표시하지 않는다. */
  const [selectedBusStop, setSelectedBusStop] = useState<BusStop | null>(null);

  /** 정류장 목록 대신 선택 노선의 상세 시트를 표시할지 결정한다. */
  const [showRouteSheet, setShowRouteSheet] = useState(false);

  /** 선택 노선의 정류장·노선 ID와 경유 순번이다. 왕복 노선의 같은 정류장도 순번으로 구분한다. */
  const [selectedRoute, setSelectedRoute] = useState<{
    stationId: string;
    routeId: string;
    stationSeq: number;
  } | null>(null);

  /** 노선 상세 시트의 정착 높이와 변경 함수다. */
  const [routeSheetSnap, setRouteSheetSnap] = useState<RouteSheetSnap>('half');

  /** 시트가 덮는 높이다. 지도 패딩과 현재 위치 버튼의 세로 배치를 맞춘다. */
  const [sheetHeight, setSheetHeight] = useState(0);

  /** 지도 선택 상태에 따라 앱 공통 탭 숨김 값을 바꾸는 함수다. */
  const setMapTabHidden = useAppStore((state) => state.setMapTabHidden);

  /** 권한을 확인해 위치를 읽는 함수, 조회 중 상태, 마지막 좌표를 위치 훅에서 받는다. */
  const { getCurrentLocation, loading, position } = useCurrentLocation();

  /** 지도를 최초 생성할 좌표, 준비 중 상태, 실패 후 재시도 함수를 받는다. */
  const { initialPosition, preparingLocation, prepareInitialPosition } = useInitialMapPosition(
    params,
    getCurrentLocation,
  );

  /** 현재 관찰하는 타일들의 Query 응답을 합친 정류장 목록이다. */
  const busStops = useNearbyBusStops(busStopTiles);

  /** 노치·상태 표시줄·홈 인디케이터를 피하기 위한 기기 안전 영역 여백이다. */
  const insets = useSafeAreaInsets();

  /** 선택 노선의 공식 형상·경유 정류장·차량 정보를 가진 Query 응답이다. */
  const { data: routeDetail } = useBusRouteDetail(
    selectedRoute?.stationId ?? '',
    selectedRoute?.routeId ?? '',
    selectedRoute?.stationSeq ?? 0,
    Boolean(selectedRoute),
  );

  /** 네이티브 지도에 전달할 마커·선과 클릭 매칭에 사용할 노선 정류장을 계산 훅에서 받는다. */
  const { markers, lines, routeStops } = useMapOverlays({
    busStops,
    selectedBusStop,
    selectedRoute,
    routeDetail,
    directionCamera,
    selectedPlace,
    subwayStation,
    subwayLineName,
    journeyEndpoints,
    journeyLines,
    routeColor: colors.accent,
  });

  /** 지도 화면을 떠날 때 탭 숨김을 해제한다. 변경 함수가 바뀌면 정리 함수를 다시 등록한다. */
  useEffect(() => () => setMapTabHidden(false), [setMapTabHidden]);

  /** 검색 활성·정류장·지하철 선택이 바뀔 때 탭 숨김 여부를 맞춘다. 파생 UI를 공용 레이아웃과 동기화한다. */
  useEffect(() => {
    setMapTabHidden(planningActive || Boolean(subwayStation || selectedBusStop));
  }, [planningActive, subwayStation, selectedBusStop, setMapTabHidden]);

  // 패딩으로 시트 위의 지도 영역을 정하고, 줌은 유지한 채 선택 좌표만 이동한다.
  /** 선택 좌표나 시트 높이가 바뀌면 패딩 적용 다음 프레임에 카메라를 맞춘다. 의존성이 바뀌거나 언마운트되면 예약 프레임을 취소한다. */
  useEffect(() => {
    /** 시트 위의 보이는 지도 영역 중앙에 둘 선택 정류장 또는 장소다. */
    const target = selectedBusStop ?? (!planningActive ? selectedPlace : null);
    if (!target || sheetHeight === 0 || !initializedRef.current) return;

    /** 지도 패딩이 반영된 다음 프레임에 카메라를 움직이도록 예약한 작업 ID다. */
    const frame = requestAnimationFrame(() => {
      mapRef.current?.animateCameraTo({
        latitude: target.latitude,
        longitude: target.longitude,
        ...(subwayStation ? { zoom: 17 } : {}),
        duration: 350,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedBusStop, selectedPlace, planningActive, subwayStation, sheetHeight]);

  /** 진행 중인 선택 요청을 무효화하고 정류장 시트와 지도 하단 여백을 닫는다. 시트에 넘기는 함수 참조를 유지하기 위해 useCallback을 쓴다. */
  const closeBusStop = useCallback(() => {
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedBusStop(null);
    setSheetHeight(0);
  }, []);

  /** 지하철·장소 선택을 해제하고 선택한 정류장의 버스 목록을 연다. 여러 지도 이벤트에서 공유하는 선택 동작이다. */
  const selectBusStop = useCallback((busStop: BusStop) => {
    setSubwayStation(null);
    setSelectedPlace(null);
    setJourneyLines([]);
    selectionRequest.current++;
    setShowRouteSheet(false);
    setSelectedBusStop(busStop);
  }, []);

  /** 검색 장소로 카메라를 옮기고 정류장 장소라면 가까운 서버 정류장과 이름을 대조한다. Query 캐시를 재사용하며 최신 요청만 선택에 반영한다. */
  const selectPlace = useCallback(
    async (place: Place | null, showBusStop = false) => {
      /** 이 비동기 선택을 시작한 시점의 세대 번호다. 응답 시 현재 번호와 다르면 결과를 버린다. */
      const request = ++selectionRequest.current;
      setSubwayStation(null);
      setSelectedPlace(place);
      if (!place) {
        setSheetHeight(0);
        return;
      }
      setShowRouteSheet(false);
      setSelectedRoute(null);
      setSelectedBusStop(null);
      setSheetHeight(0);
      mapRef.current?.animateCameraTo({ ...place, zoom: 17, duration: 350 });
      if (!showBusStop || !isBusStopPlace(place)) return;
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
    [queryClient, selectBusStop],
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

  /** 검색 화면의 길찾기 모드 변경을 받아 지도 버튼과 탭의 노출 상태를 맞춘다. 자식 effect의 의존성이 흔들리지 않도록 참조를 유지한다. */
  const onPlanningChange = useCallback((active: boolean) => {
    setPlanningActive(active);
  }, []);

  /** 길찾기 출발·도착 장소를 받아 지도 끝점 마커에 연결한다. 자식의 상태 전달 effect가 함수 재생성 때문에 반복되지 않게 useCallback을 쓴다. */
  const onEndpoints = useCallback((start: Place | null, end: Place | null) => {
    setJourneyEndpoints({ start, end });
  }, []);

  /** 선택한 길찾기 좌표를 표시하고 끝점 라벨까지 포함하도록 지도 범위에 여백을 둔다. 범위 계산은 경로 선택 이벤트에서만 실행되어 별도 useMemo가 필요 없다. */
  const showJourney = useCallback((lines: Point[][]) => {
    setJourneyLines(lines);

    /** 여러 길찾기 구간을 하나로 펼친 좌표 목록이다. 전체 경로의 화면 범위를 구할 때 사용한다. */
    const points = lines.flat();
    if (!points.length) return;

    /** 경로 좌표의 최남·최북·최서·최동 지점으로 만든 지도 경계다. */
    const bounds = points.reduce(
      (b, p) => ({
        south: Math.min(b.south, p.latitude),
        west: Math.min(b.west, p.longitude),
        north: Math.max(b.north, p.latitude),
        east: Math.max(b.east, p.longitude),
      }),
      {
        south: points[0].latitude,
        west: points[0].longitude,
        north: points[0].latitude,
        east: points[0].longitude,
      },
    );

    // 경로의 끝점 마커와 라벨까지 화면 안에 남도록 좌표 범위에 여백을 둔다.
    /** 경로 끝점과 라벨이 잘리지 않도록 경계에 추가하는 위도 여유 폭이다. */
    const latitudeMargin = Math.max((bounds.north - bounds.south) * 0.12, 0.0003);

    /** 경로 끝점과 라벨이 잘리지 않도록 경계에 추가하는 경도 여유 폭이다. */
    const longitudeMargin = Math.max((bounds.east - bounds.west) * 0.12, 0.0003);
    mapRef.current?.animateCameraWithTwoCoords({
      coord1: {
        latitude: bounds.south - latitudeMargin,
        longitude: bounds.west - longitudeMargin,
      },
      coord2: {
        latitude: bounds.north + latitudeMargin,
        longitude: bounds.east + longitudeMargin,
      },
      duration: 350,
    });
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
    selectBusStop,
    queryClient,
  ]);

  /** 활성화 정류소의 전체 버스 목록을 열면서 지도에는 현재 노선을 유지한다. */
  const selectRouteStop = useCallback(
    async (stop: BusRouteDetail['stops'][number]) => {
      if (!selectedRoute || !routeDetail) return;

      /** 이 비동기 선택을 시작한 시점의 세대 번호다. 응답 시 현재 번호와 다르면 결과를 버린다. */
      const request = ++selectionRequest.current;

      /** 선택 정류장이 현재 노선에서 나타나는 경유 항목이다. 왕복·순환 중 어떤 순번인지 확인한다. */
      const occurrence = getRouteStopOccurrence(
        routeDetail.stops,
        stop.stationId,
        selectedRoute.stationSeq,
      );
      if (!occurrence) return;
      mapRef.current?.animateCameraTo({
        latitude: stop.latitude,
        longitude: stop.longitude,
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
        setSelectedRoute({
          stationId: station.id,
          routeId: selectedRoute.routeId,
          stationSeq: occurrence.stationSeq,
        });
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
      const nextTiles = getVisibleBusStopTiles(zoom, region);
      if (nextTiles.length === 0 && !selectedRoute) closeBusStop();
      setBusStopTiles((currentTiles) =>
        haveSameTiles(currentTiles, nextTiles) ? currentTiles : nextTiles,
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

    mapRef.current?.animateCameraTo({
      ...coordinate,
      zoom: 17,
      duration: 500,
    });
  }, [getCurrentLocation]);

  /** 네이티브 지도 이동이 끝난 영역만 정류장 타일 조회로 전달한다. 이동 중 매 프레임 서버를 호출하지 않는다. */
  const onCameraIdle = useCallback(
    ({ zoom, region }: { zoom?: number; region: Parameters<typeof getVisibleBusStopTiles>[1] }) => {
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
      const routeStop =
        selectedRoute && routeDetail?.stops.find((stop) => isRouteBusStop(station, [stop]));
      if (routeStop) void selectRouteStop(routeStop);
      else selectBusStop(station);
    },
    [selectedRoute, routeDetail, selectRouteStop, selectBusStop],
  );

  /** 정류장 목록에서 고른 노선과 정류장 순번을 저장하고 노선 시트를 중간 높이로 연다. */
  const selectBusRoute = useCallback(
    (routeId: string, stationSeq: number) => {
      if (!selectedBusStop) return;
      setSelectedRoute({ stationId: selectedBusStop.id, routeId, stationSeq });
      setShowRouteSheet(true);
      setRouteSheetSnap('half');
    },
    [selectedBusStop],
  );

  /** 마커 ID의 접두어로 일반 정류장과 노선 정류장을 구분해 해당 선택 함수에 전달한다. 서버 호출을 직접 수행하지 않는다. */
  const onMarkerPress = useCallback(
    (id: string) => {
      if (id.startsWith('stop:')) {
        /** 클릭한 마커 ID 또는 알림 정류장 ID와 일치하는 정류장 후보다. */
        const stop =
          selectedBusStop?.id === id.slice(5)
            ? selectedBusStop
            : busStops.find((item) => item.id === id.slice(5));
        if (stop) {
          if (stop.id === selectedBusStop?.id) selectSelectedStop(stop);
          else selectBusStop(stop);
        }
      } else if (id.startsWith('route-stop:')) {
        /** 클릭한 마커 ID 또는 알림 정류장 ID와 일치하는 정류장 후보다. */
        const stop = routeStops.find((item) => item.stationId === id.slice(11));
        if (stop) void selectRouteStop(stop);
      }
    },
    [selectedBusStop, busStops, routeStops, selectSelectedStop, selectBusStop, selectRouteStop],
  );

  /** 지하철 선택 요청을 무효화하고 지하철 시트와 하단 지도 여백을 닫는다. */
  const closeSubway = useCallback(() => {
    selectionRequest.current++;
    setSubwayStation(null);
    setSheetHeight(0);
  }, []);

  /** 선택 정류장 좌표를 앱 내부 길찾기의 출발·도착 입력으로 전달한다. 지도 선택을 닫기 전에 장소를 구성한다. */
  const routeFromBusStop = useCallback(
    (field: 'start' | 'end') => {
      if (!selectedBusStop) return;

      /** 외부 장소 검색 없이 서버 정류장의 검증된 좌표를 사용하는 길찾기 입력이다. */
      const place: Place = {
        id: selectedBusStop.id,
        name: selectedBusStop.name,
        latitude: selectedBusStop.latitude,
        longitude: selectedBusStop.longitude,
        address: '',
        category: '버스정류장',
        distanceMeters: selectedBusStop.distanceMeters,
      };
      activateSearch();
      setRouteIntent({ id: ++routeIntentRevision.current, place, field });
    },
    [selectedBusStop, activateSearch],
  );

  /** 선택한 역의 실제 장소 좌표를 길찾기의 출발 또는 도착 입력으로 전달한다. 좌표가 준비되지 않았다면 안내한다. */
  const routeFromSubway = useCallback(
    (field: 'start' | 'end') => {
      if (!selectedPlace) {
        Alert.alert('역 위치를 확인 중이에요', '위치를 불러온 뒤 다시 눌러주세요.');
        return;
      }

      /** 역 선택 또는 길찾기에 전달할 실제 장소 좌표와 표시 이름이다. */
      const place = { ...selectedPlace, name: `${subwayStation}역` };
      activateSearch();
      setRouteIntent({ id: ++routeIntentRevision.current, place, field });
    },
    [selectedPlace, subwayStation, activateSearch],
  );

  /** 역·호선에 맞는 실제 장소 좌표를 Query로 조회해 선택하고 카메라를 이동한다. 먼저 시작한 검색이 나중 선택을 덮어쓰지 않게 세대를 확인한다. */
  const selectSubwayStation = useCallback(
    async (name: string, lineName: string, point?: Point) => {
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

        /** 역 선택 또는 길찾기에 전달할 실제 장소 좌표와 표시 이름이다. */
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
        setSubwayStation(name);
        setSubwayLineName(lineName);
        mapRef.current?.animateCameraTo({ ...place, zoom: 17, duration: 350 });
      } catch {
        if (request === selectionRequest.current)
          Alert.alert('역 위치를 확인하지 못했어요', '다시 선택해주세요.');
      }
    },
    [selectedPlace, initialPosition, queryClient],
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

  return {
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
  };
}
