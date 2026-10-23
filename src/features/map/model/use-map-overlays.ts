/**
 * @fileoverview 지도에 표시할 정류장·선택 장소·노선 선·방향 화살표를 계산하는 전용 훅.
 * 입력을 표시용 데이터로 변환할 뿐 서버 요청·카메라 이동·선택 상태 변경은 하지 않는다.
 */
import { useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import type { BusRouteDetail } from '@/features/bus-stop/api/get-bus-route-detail';
import {
  alignRouteToStops,
  getRouteDirectionMarkers,
} from '@/features/bus-stop/model/route-direction-markers';

import { markerImage, routeStopImage, stopMarker, PIN_MARKER_ANCHOR } from '@/features/bus-stop/model/map-markers';
import type { MapSymbol } from '@/shared/types/geo';
import { isBoardingRouteStop } from '@/features/bus-stop/model/bus-route-presentation';
import {
  busSymbolKey,
  matchBusStopSymbols,
} from '@/features/bus-stop/model/match-bus-stop-symbols';
import { matchRouteSymbolPositions } from '@/features/bus-stop/model/route-symbol-positions';
import { searchTransport } from '@/features/mobility/model/search-transport';
import { matchSearchSymbols } from '@/features/mobility/model/match-search-symbols';
import type { SubwayMapStation } from '@/features/subway/api/get-subway-station';
import type { Place, Point } from '@/features/mobility/api/mobility';
import type { MapMarker, MapLine, MapRegion } from '@/shared/ui/map/map-view';

/** 노선 진행 방향 화살표에 사용할 로컬 이미지 자산이다. */
const ROUTE_DIRECTION_PATTERN = require('@/assets/images/route-direction-triangle.png');

const SEARCH_BUS_MARKER = require('@/assets/images/search-bus-marker.png');
const SEARCH_SUBWAY_MARKER = Platform.OS === 'ios'
  ? require('@/assets/images/subway-alert-pin-ios.png')
  : require('@/assets/images/subway-alert-pin-android.png');
const SEARCH_PLACE_MARKER = require('@/assets/images/search-place-marker.png');
const SEARCH_EXIT_MARKER = require('@/assets/images/search-exit-marker.png');

type OverlayInput = {
  subwaySelection?: boolean;
  busStops: BusStop[];
  selectedBusStop: BusStop | null;
  selectedBusStopPoint: Point | null;
  visibleMapSymbols: MapSymbol[];
  selectedRoute: { stationId: string; routeId: string; stationSeq: number } | null;
  routeDetail: BusRouteDetail | undefined;
  directionCamera: { zoom: number; region: MapRegion } | null;
  selectedPlace: Place | null;
  searchResults: Place[];
  selectedSearchId: string | null;
  searchBusStops: BusStop[];
  subwayStops: SubwayMapStation[];
  subwayStation: string | null;
  subwayLineName: string | undefined;
};

/**
 * 지도 선택과 Query 응답을 지도 오버레이로 변환한다.
 * @param input 화면이 소유하는 선택 상태와 서버에서 받은 정류장·노선 자료.
 * @returns 네이티브 마커·선 배열 및 마커 클릭에 사용할 중복 제거된 노선 정류장.
 */
export function useMapOverlays({
  subwaySelection = false,
  busStops,
  selectedBusStop,
  selectedBusStopPoint,
  visibleMapSymbols,
  selectedRoute,
  routeDetail,
  directionCamera,
  selectedPlace,
  searchResults,
  selectedSearchId,
  searchBusStops,
  subwayStops,
  subwayStation,
  subwayLineName,
}: OverlayInput) {
  const searchKey = `subway-first-symbols-v6:${searchResults
    .map((place) => place.id)
    .sort()
    .join('|')}`;
  const [confirmedSearchSymbols, setConfirmedSearchSymbols] = useState({
    key: '',
    positions: new Map<string, Point>(),
  });
  const searchSymbolPositions = useMemo(() => {
    const previous =
      confirmedSearchSymbols.key === searchKey
        ? confirmedSearchSymbols.positions
        : new Map([...confirmedSearchSymbols.positions].filter(([id]) => searchResults.some((place) => place.id === id)));
    const fresh = matchSearchSymbols(
      searchResults,
      visibleMapSymbols,
      [...busStops, ...searchBusStops],
      subwayStops,
      previous,
    );
    const changed = [...fresh].some(([id, point]) => {
      const known = previous.get(id);
      return !known || known.latitude !== point.latitude || known.longitude !== point.longitude;
    });
    if (!changed) return previous;
    const next = new Map(previous);
    for (const [id, point] of fresh) {
      next.set(id, point);
    }
    return next;
  }, [
    searchResults,
    visibleMapSymbols,
    busStops,
    searchBusStops,
    subwayStops,
    searchKey,
    confirmedSearchSymbols,
  ]);
  if (
    confirmedSearchSymbols.key !== searchKey ||
    confirmedSearchSymbols.positions !== searchSymbolPositions
  )
    setConfirmedSearchSymbols({ key: searchKey, positions: searchSymbolPositions });

  /** 서버가 반환한 선택 노선의 공식 좌표 형상이다. */
  const geometry = routeDetail?.geometry;

  /** 좌표 없는 항목과 같은 정류장 ID를 걸러 네이티브 오버레이가 중복되지 않게 한다. */
  const routeStops = useMemo(() => {
    /** 이미 포함한 정류장 ID 집합이다. 중복된 노선 마커를 방지한다. */
    const ids = new Set<string>();
    return (routeDetail?.stops ?? []).filter((stop) => {
      if (
        !isBoardingRouteStop(stop) ||
        !Number.isFinite(stop.latitude) ||
        !Number.isFinite(stop.longitude) ||
        ids.has(stop.stationId)
      )
        return false;
      ids.add(stop.stationId);
      return true;
    });
  }, [routeDetail?.stops]);

  const [confirmedRouteSymbols, setConfirmedRouteSymbols] = useState({
    routeId: '',
    positions: new Map<string, Point>(),
  });
  const routeId = selectedRoute?.routeId ?? '';
  const routeSymbolPositions = useMemo(() => {
    const fresh = matchRouteSymbolPositions(routeStops, visibleMapSymbols, busStops);
    const sameRoute = confirmedRouteSymbols.routeId === routeId;
    const previous = sameRoute ? confirmedRouteSymbols.positions : new Map<string, Point>();
    const changed = [...fresh].some(([id, point]) => {
      const known = previous.get(id);
      return !known || known.latitude !== point.latitude || known.longitude !== point.longitude;
    });
    // 이전에 정류장으로 검증한 위치만 유지해 이동 중 빈 스냅샷에도 표시를 보존한다.
    return changed ? new Map([...previous, ...fresh]) : previous;
  }, [routeStops, visibleMapSymbols, busStops, routeId, confirmedRouteSymbols]);
  if (
    confirmedRouteSymbols.routeId !== routeId ||
    confirmedRouteSymbols.positions !== routeSymbolPositions
  )
    setConfirmedRouteSymbols({ routeId, positions: routeSymbolPositions });

  /** 검색으로 연 정류장도 대표 좌표 대신 확인된 네이버 심벌 위치에 표시한다. */
  const selectedSymbolPoint = useMemo(() => {
    if (!selectedBusStop) return null;
    const matched = matchBusStopSymbols(visibleMapSymbols, [...busStops, selectedBusStop]);
    return (
      visibleMapSymbols.find(
        (symbol) => matched.get(busSymbolKey(symbol))?.id === selectedBusStop.id,
      ) ?? null
    );
  }, [visibleMapSymbols, busStops, selectedBusStop]);

  /** 지도 이동·심벌 로딩에 따라 회전선이 변하지 않도록 공식 경로와 정류장만 사용한다. */
  const routeCoordinates = useMemo(() => {
    if (geometry?.source !== 'official') return [];
    return alignRouteToStops(
      geometry.points,
      (routeDetail?.stops ?? []).filter(isBoardingRouteStop),
    );
  }, [geometry, routeDetail?.stops]);

  const directionMarkers = useMemo(
    () =>
      directionCamera
        ? getRouteDirectionMarkers(routeCoordinates, directionCamera.zoom, directionCamera.region)
        : [],
    [routeCoordinates, directionCamera],
  );

  /** 네이티브로 보내는 마커 배열은 선택·좌표가 바뀔 때만 새로 만든다. 위치 로딩 같은 다른 렌더에서 이미지 처리를 반복하지 않기 위한 useMemo다. */
  const markers = useMemo<MapMarker[]>(() => {
    /** 최종 네이티브 마커 배열을 누적하는 지역 변수다. 이 계산 밖에 별도 상태로 보관하지 않는다. */
    // 노선 정류장은 지도 심벌이 숨겨지는 축척에서도 공식 좌표로 표시한다.
    const items: MapMarker[] = [];
    searchResults.forEach((place, index) => {
      const point = searchSymbolPositions.get(place.id) ?? place;
      const kind = searchTransport(place).kind;
      const transit = kind === 'bus' || kind === 'subway';
      // 축소 시에도 마지막으로 확인한 네이버 심벌 좌표를 유지한다.
      const selected = place.id === selectedSearchId;
      const width = transit ? (selected ? 36 : 32) : (selected ? 26 : 22);
      items.push({
        ...point,
        id: `search-result:${place.id}`,
        kind: 'place',
        imageUri: markerImage(kind === 'bus' ? SEARCH_BUS_MARKER : kind === 'exit' ? SEARCH_EXIT_MARKER : kind === 'subway' ? SEARCH_SUBWAY_MARKER : SEARCH_PLACE_MARKER),
        caption: place.id === selectedSearchId ? `${index + 1}. ${place.name}` : String(index + 1),
        captionMinZoom: 0,
        minZoom: 0,
        width,
        height: width * 1.25,
        anchor: PIN_MARKER_ANCHOR,
        globalZIndex: place.id === selectedSearchId ? 400 : (kind === 'subway' ? 350 : 300) - Math.min(index, 49),
      });
    });
    if (subwaySelection) return items;
    if (selectedRoute)
      for (const stop of routeStops) {
        const point = routeSymbolPositions.get(stop.stationId) ?? stop;
        if (selectedBusStop && stop.stationId === routeDetail?.selectedStationId) continue;
        items.push({
          ...point,
          id: `route-stop:${stop.stationId}`,
          imageUri: routeStopImage,
          width: 26.4,
          height: 33,
          anchor: PIN_MARKER_ANCHOR,
          caption: stop.name,
          minZoom: 0,
          globalZIndex: 250,
        });
      }
    const selectedPoint =
      selectedBusStopPoint ??
      selectedSymbolPoint ??
      routeSymbolPositions.get(routeDetail?.selectedStationId ?? '') ??
      selectedBusStop;
    if (selectedBusStop && selectedPoint && !searchResults.some((place) => place.id === `station:${selectedBusStop.id}`)) {
      items.push({
        ...stopMarker(selectedBusStop, true, Boolean(selectedRoute)),
        ...selectedPoint,
        id: `selected-stop:${selectedBusStop.id}`,
        globalZIndex: 300,
      });
    }
    if (
      selectedPlace &&
      !searchResults.some((place) => place.id === selectedPlace.id) &&
      (!selectedPlace.id.startsWith('subway:') || subwayStation)
    ) {
      const kind = subwayStation ? 'subway' : searchTransport(selectedPlace).kind;
      const width = kind === 'bus' || kind === 'subway' ? 36 : 26;
      items.push({
        ...selectedPlace,
        id: `place:${selectedPlace.id}`,
        caption: subwayStation
          ? `${subwayStation}역 ${subwayLineName?.replace(/^수도권/, '') ?? ''}`.trim()
          : selectedPlace.name,
        imageUri: markerImage(kind === 'subway' ? SEARCH_SUBWAY_MARKER
          : kind === 'bus' ? SEARCH_BUS_MARKER
          : kind === 'exit' ? SEARCH_EXIT_MARKER : SEARCH_PLACE_MARKER),
        anchor: PIN_MARKER_ANCHOR,
        width,
        height: width * 1.25,
      });
    }
    if (selectedRoute)
      items.push(
        ...directionMarkers.map((marker) => ({
          id: `direction:${marker.id}`,
          latitude: marker.latitude,
          longitude: marker.longitude,
          imageUri: markerImage(ROUTE_DIRECTION_PATTERN),
          width: 12,
          height: 12,
          anchor: { x: 0.5, y: 0.5 },
          rotation: marker.angle,
          globalZIndex: 100,
        })),
      );
    /** 일반 아이콘과 선택 핀은 서로 다른 ID로 유지하고 같은 ID의 중복만 제거한다. */
    return [...new Map(items.map((marker) => [marker.id, marker])).values()];
  }, [
    subwaySelection,
    selectedRoute,
    routeStops,
    routeSymbolPositions,
    routeDetail?.selectedStationId,
    selectedBusStop,
    selectedBusStopPoint,
    selectedSymbolPoint,
    selectedPlace,
    searchResults,
    selectedSearchId,
    searchSymbolPositions,
    directionMarkers,
    subwayStation,
    subwayLineName,
  ]);

  /** 선 좌표가 동일할 때 네이티브에 같은 선 배열을 반복 전달하지 않도록 참조를 유지한다. */
  const lines = useMemo<MapLine[]>(
    () => [
      ...(selectedRoute && routeCoordinates.length > 1
        ? [
            {
              id: `route:${selectedRoute.routeId}`,
              points: routeCoordinates,
              color: '#00A86B',
              width: 6,
            },
          ]
        : []),
    ],
    [selectedRoute, routeCoordinates],
  );
  return { markers, lines, routeStops, searchSymbolPositions };
}
