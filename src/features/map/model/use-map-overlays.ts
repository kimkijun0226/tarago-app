/**
 * @fileoverview 지도에 표시할 정류장·선택 장소·노선 선·방향 화살표를 계산하는 전용 훅.
 * 입력을 표시용 데이터로 변환할 뿐 서버 요청·카메라 이동·선택 상태 변경은 하지 않는다.
 */
import { useMemo } from 'react';
import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import type { BusRouteDetail } from '@/features/bus-stop/api/get-bus-route-detail';
import { isRouteBusStop } from '@/features/bus-stop/model/bus-route-presentation';
import {
  alignRouteToStops,
  getRouteDirectionMarkers,
} from '@/features/bus-stop/model/route-direction-markers';
import { markerImage, stopMarker, routeStopImage } from '@/features/bus-stop/model/map-markers';
import type { Place, Point } from '@/features/mobility/api/mobility';
import type { TmapMarker, TmapLine, MapRegion } from '@/shared/ui/tmap/tmap-view';

/** 노선 진행 방향 화살표에 사용할 로컬 이미지 자산이다. */
const ROUTE_DIRECTION_PATTERN = require('@/assets/images/route-direction-triangle.png');

/** 선택 지하철역에 표시할 로컬 핀 이미지다. */
const SUBWAY_STATION_MARKER = require('@/assets/images/subway-station-marker.png');

type OverlayInput = {
  busStops: BusStop[];
  selectedBusStop: BusStop | null;
  selectedRoute: { stationId: string; routeId: string; stationSeq: number } | null;
  routeDetail: BusRouteDetail | undefined;
  directionCamera: { zoom: number; region: MapRegion } | null;
  selectedPlace: Place | null;
  subwayStation: string | null;
  subwayLineName: string | undefined;
  journeyEndpoints: { start: Place | null; end: Place | null };
  journeyLines: Point[][];
  routeColor: string;
};

/**
 * 지도 선택과 Query 응답을 TMAP 오버레이로 변환한다.
 * @param input 화면이 소유하는 선택 상태와 서버에서 받은 정류장·노선 자료.
 * @returns 네이티브 마커·선 배열 및 마커 클릭에 사용할 중복 제거된 노선 정류장.
 */
export function useMapOverlays({
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
  routeColor,
}: OverlayInput) {
  /** 서버가 반환한 선택 노선의 공식 좌표 형상이다. */
  const geometry = routeDetail?.geometry;

  /** 노선 형상을 경유 순서에 맞추는 데 사용할 공식 정류장 목록이다. */
  const stops = routeDetail?.stops;

  /** 공식 형상의 많은 좌표를 정류장 순서에 맞추는 계산은 입력이 바뀔 때만 반복한다. */
  const routeCoordinates = useMemo(
    () =>
      geometry?.source === 'official' && stops ? alignRouteToStops(geometry.points, stops) : [],
    [geometry, stops],
  );

  /** 노선 좌표와 카메라가 같다면 방향 화살표 간격·각도 계산 결과를 재사용한다. */
  const directionMarkers = useMemo(
    () =>
      directionCamera
        ? getRouteDirectionMarkers(routeCoordinates, directionCamera.zoom, directionCamera.region)
        : [],
    [routeCoordinates, directionCamera],
  );

  /** 위치나 시트 UI만 바뀔 때 모든 정류장의 영역 필터링을 반복하지 않도록 한다. */
  const visibleBusStops = useMemo(() => {
    /** 마커를 표시할 카메라의 남서쪽 기준 범위와 위도·경도 폭이다. */
    const region = directionCamera?.region;
    return busStops.filter(
      (stop) =>
        stop.id !== selectedBusStop?.id &&
        (!selectedRoute || !routeDetail || !isRouteBusStop(stop, routeDetail.stops)) &&
        (!region ||
          (stop.latitude >= region.latitude - region.latitudeDelta * 0.15 &&
            stop.latitude <= region.latitude + region.latitudeDelta * 1.15 &&
            stop.longitude >= region.longitude - region.longitudeDelta * 0.15 &&
            stop.longitude <= region.longitude + region.longitudeDelta * 1.15)),
    );
  }, [busStops, selectedRoute, routeDetail, selectedBusStop?.id, directionCamera]);

  /** 좌표 없는 항목과 같은 정류장 ID를 걸러 네이티브 오버레이가 중복되지 않게 한다. */
  const routeStops = useMemo(() => {
    /** 이미 포함한 정류장 ID 집합이다. 중복된 노선 마커를 방지한다. */
    const ids = new Set<string>();
    return (routeDetail?.stops ?? []).filter((stop) => {
      if (
        !Number.isFinite(stop.latitude) ||
        !Number.isFinite(stop.longitude) ||
        ids.has(stop.stationId)
      )
        return false;
      ids.add(stop.stationId);
      return true;
    });
  }, [routeDetail?.stops]);

  /** 네이티브로 보내는 마커 배열은 선택·좌표가 바뀔 때만 새로 만든다. 위치 로딩 같은 다른 렌더에서 이미지 처리를 반복하지 않기 위한 useMemo다. */
  const markers = useMemo<TmapMarker[]>(() => {
    /** 최종 네이티브 마커 배열을 누적하는 지역 변수다. 이 계산 밖에 별도 상태로 보관하지 않는다. */
    const items = visibleBusStops.map((stop) => stopMarker(stop, false));
    if (selectedRoute)
      items.push(
        ...routeStops.map((stop) => ({
          id: `route-stop:${stop.stationId}`,
          latitude: stop.latitude,
          longitude: stop.longitude,
          imageUri: routeStopImage,
          width: 24,
          height: 24,
          anchor: { x: 0.5, y: 0.5 },
          caption: stop.name,
          minZoom: 13,
        })),
      );
    if (selectedBusStop) items.push(stopMarker(selectedBusStop, true, Boolean(selectedRoute)));
    if (selectedPlace && !journeyEndpoints.start && !journeyEndpoints.end)
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
        })),
      );
    return items;
  }, [
    visibleBusStops,
    selectedRoute,
    routeStops,
    selectedBusStop,
    selectedPlace,
    directionMarkers,
    journeyEndpoints,
    subwayStation,
    subwayLineName,
  ]);

  /** 선 좌표가 동일할 때 네이티브에 같은 선 배열을 반복 전달하지 않도록 참조를 유지한다. */
  const lines = useMemo<TmapLine[]>(
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
  return { markers, lines, routeStops };
}
