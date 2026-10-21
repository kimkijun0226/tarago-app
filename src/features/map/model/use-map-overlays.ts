/**
 * @fileoverview 지도에 표시할 정류장·선택 장소·노선 선·방향 화살표를 계산하는 전용 훅.
 * 입력을 표시용 데이터로 변환할 뿐 서버 요청·카메라 이동·선택 상태 변경은 하지 않는다.
 */
import { useMemo, useState } from 'react';
import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import type { BusRouteDetail } from '@/features/bus-stop/api/get-bus-route-detail';
import {
  alignRouteToStops,
  getRouteDirectionMarkers,
} from '@/features/bus-stop/model/route-direction-markers';

import { markerImage, routeStopImage, stopMarker } from '@/features/bus-stop/model/map-markers';
import type { MapSymbol } from '@/shared/types/geo';
import { isBoardingRouteStop } from '@/features/bus-stop/model/bus-route-presentation';
import {
  busSymbolKey,
  matchBusStopSymbols,
} from '@/features/bus-stop/model/match-bus-stop-symbols';
import { matchRouteSymbolPositions } from '@/features/bus-stop/model/route-symbol-positions';
import { matchSearchSymbols } from '@/features/mobility/model/match-search-symbols';
import type { SubwayMapStation } from '@/features/subway/api/get-subway-station';
import type { Place, Point } from '@/features/mobility/api/mobility';
import type { MapMarker, MapLine, MapRegion } from '@/shared/ui/map/map-view';

/** 노선 진행 방향 화살표에 사용할 로컬 이미지 자산이다. */
const ROUTE_DIRECTION_PATTERN = require('@/assets/images/route-direction-triangle.png');

/** 선택 지하철역에 표시할 로컬 핀 이미지다. */
const SUBWAY_STATION_MARKER = require('@/assets/images/subway-station-marker.png');

type OverlayInput = {
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
  journeyEndpoints: { start: Place | null; end: Place | null };
  journeyLines: Point[][];
  routeColor: string;
};

/**
 * 지도 선택과 Query 응답을 지도 오버레이로 변환한다.
 * @param input 화면이 소유하는 선택 상태와 서버에서 받은 정류장·노선 자료.
 * @returns 네이티브 마커·선 배열 및 마커 클릭에 사용할 중복 제거된 노선 정류장.
 */
export function useMapOverlays({
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
  journeyEndpoints,
  journeyLines,
  routeColor,
}: OverlayInput) {
  const searchKey = `named-subway-v2:${searchResults.map(place => place.id).sort().join('|')}`;
  const [confirmedSearchSymbols, setConfirmedSearchSymbols] = useState({ key: '', positions: new Map<string, Point>() });
  const searchSymbolPositions = useMemo(() => {
    const fresh = matchSearchSymbols(searchResults, visibleMapSymbols, [...busStops, ...searchBusStops], subwayStops);
    const previous = confirmedSearchSymbols.key === searchKey ? confirmedSearchSymbols.positions : new Map<string, Point>();
    const changed = [...fresh].some(([id, point]) => {
      const known = previous.get(id);
      return !known || known.latitude !== point.latitude || known.longitude !== point.longitude;
    });
    if (!changed) return previous;
    const next = new Map(previous);
    for (const [id, point] of fresh) {
      for (const [other, known] of next)
        if (other !== id && busSymbolKey(known) === busSymbolKey(point)) next.delete(other);
      next.set(id, point);
    }
    return next;
  }, [searchResults, visibleMapSymbols, busStops, searchBusStops, subwayStops, searchKey, confirmedSearchSymbols]);
  if (confirmedSearchSymbols.key !== searchKey || confirmedSearchSymbols.positions !== searchSymbolPositions)
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
    // 네이버 심벌이 확인되지 않은 위치에 노선 정류장 마커를 만들지 않는다.
    const items: MapMarker[] = [];
    searchResults.forEach((place, index) => {
      const point = searchSymbolPositions.get(place.id);
      if (!point) return;
      items.push({
        ...point, id: `search-result:${place.id}`, kind: 'place',
        caption: place.id === selectedSearchId ? `${index + 1}. ${place.name}` : String(index + 1), captionMinZoom: 0,
        width: place.id === selectedSearchId ? 40 : 28,
        height: place.id === selectedSearchId ? 48 : 36,
        anchor: { x: 0.5, y: 1 },
        globalZIndex: place.id === selectedSearchId ? 400 : 300,
      });
    });
    if (selectedRoute)
      for (const stop of routeStops) {
        const point = routeSymbolPositions.get(stop.stationId);
        if (!point) continue;
        if (selectedBusStop && stop.stationId === routeDetail?.selectedStationId) continue;
        items.push({
          ...point,
          id: `route-stop:${stop.stationId}`,
          imageUri: routeStopImage,
          width: 24,
          height: 24,
          anchor: { x: 0.5, y: 0.5 },
          caption: stop.name,
          minZoom: 14,
          globalZIndex: 250,
        });
      }
    const selectedPoint =
      selectedBusStopPoint ??
      selectedSymbolPoint ??
      routeSymbolPositions.get(routeDetail?.selectedStationId ?? '') ?? null;
    if (selectedBusStop && selectedPoint) {
      // 핀 끝의 정류소 아이콘도 별도 오버레이로 확대해 기본 심벌의 표시 여부에 영향받지 않게 한다.
      items.push({
        ...stopMarker(selectedBusStop, false, Boolean(selectedRoute)),
        latitude: selectedPoint.latitude,
        longitude: selectedPoint.longitude,
        id: `selected-stop-base:${selectedBusStop.id}`,
        width: 32,
        height: 32,
        caption: '',
        minZoom: 0,
        globalZIndex: 290,
      });
      items.push({
        ...stopMarker(selectedBusStop, true, Boolean(selectedRoute)),
        ...selectedPoint,
        id: `selected-stop:${selectedBusStop.id}`,
        globalZIndex: 300,
      });
    }
    if (
      selectedPlace &&
      !searchResults.some(place => place.id === selectedPlace.id) &&
      (!selectedPlace.id.startsWith('subway:') || subwayStation) &&
      !journeyEndpoints.start &&
      !journeyEndpoints.end
    )
      items.push({
        ...selectedPlace,
        id: `place:${selectedPlace.id}`,
        caption: subwayStation
          ? `${subwayStation}역 ${subwayLineName?.replace(/^수도권/, '') ?? ''}`.trim()
          : selectedPlace.name,
        ...(subwayStation
          ? {
              imageUri: markerImage(SUBWAY_STATION_MARKER),
              anchor: { x: 0.5, y: 1 },
              width: 32,
              height: 44,
            }
          : { kind: 'place' as const, width: 32, height: 40 }),
      });
    for (const [label, place] of [
      ['출발', journeyEndpoints.start],
      ['도착', journeyEndpoints.end],
    ] as const) {
      if (place)
        items.push({
          ...place,
          id: `endpoint:${label}:${place.id}`,
          caption: `${label} · ${place.name}`,
          kind: 'place',
          width: 32,
          height: 40,
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
    journeyEndpoints,
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
      ...journeyLines.map((points, index) => ({
        id: `journey:${index}`,
        points,
        color: routeColor,
        width: 6,
      })),
    ],
    [selectedRoute, routeCoordinates, journeyLines, routeColor],
  );
  return { markers, lines, routeStops, searchSymbolPositions };
}
