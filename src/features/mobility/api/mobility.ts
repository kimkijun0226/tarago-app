/** @fileoverview 장소 검색·길찾기의 서버 계약과 요청 함수를 정의한다. UI와 위치 권한 처리는 호출자가 담당한다. */

import { apiClient } from '@/shared/api/client';
import type { Point } from '@/shared/types/geo';
export type { Point } from '@/shared/types/geo';
/** 검색 장소. entrance가 있으면 길찾기는 표시용 대표 좌표 대신 실제 출입구를 사용한다. */
export type Place = Point & {
  entrance?: Point;
  /** 공식 역 검색에서 선택한 호선을 유지한다. */
  subwayLineName?: string;
  id: string;
  name: string;
  address: string;
  category: string;
  distanceMeters: number | null;
};
/** 한 이동 구간의 정류장·역. sequence로 같은 ID가 다시 나타나는 경유 순서를 구분한다. */
export type RouteStop = {
  id: string;
  name: string;
  sequence: number;
  latitude?: number;
  longitude?: number;
};
/** 서버가 제공한 도보 안내와 해당 안내 구간의 선 좌표. */
export type WalkInstruction = { description: string; distanceMeters: number; geometry: Point[] };
/** 도보·버스·지하철 중 하나의 이동 구간. 공급자가 제공하지 않은 상세 선·역 목록은 생략될 수 있다. */
export type RouteStep = {
  mode: 'walk' | 'bus' | 'subway';
  minutes: number;
  distanceMeters: number;
  startName: string;
  endName: string;
  lineNames: string[];
  stationCount: number;
  geometry?: Point[][];
  start?: Point;
  end?: Point;
  lineColor?: string;
  lineId?: string;
  stops?: RouteStop[];
  walkInstructions?: WalkInstruction[];
};
/** 사용자가 비교할 전체 경로. geometryStatus로 지도 선의 제공 여부와 경로 존재 여부를 구분한다. */
export type Journey = {
  id: string;
  minutes: number;
  walkMeters: number;
  fare: number;
  transfers: number;
  steps: RouteStep[];
  geometry: Point[][];
  geometryStatus: 'available' | 'unavailable';
};
/** 경로 검색의 서버 지원 범위. transit는 버스와 지하철을 함께 포함한다. */
export type TravelMode = 'transit' | 'bus' | 'walk';

/**
 * 주변 좌표를 기준으로 장소를 검색한다. 외부 서비스 키는 서버에만 둔다.
 * @param q 검색어.
 * @param near 검색 중심 좌표.
 * @param signal Query가 전달하는 요청 취소 신호.
 * @returns 서버가 정규화한 장소 목록.
 */
export async function searchPlaces(q: string, near: Point, signal?: AbortSignal): Promise<Place[]> {
  return (await apiClient.get<Place[]>('/mobility/places', { params: { q, ...near }, signal }))
    .data;
}

/**
 * 출입구 좌표가 있으면 대표 좌표보다 우선하여 경로를 요청한다.
 * @param start 출발 장소와 선택적 출입구.
 * @param end 도착 장소와 선택적 출입구.
 * @param mode 대중교통·버스·도보 검색 방식.
 * @param signal Query의 요청 취소 신호.
 * @returns 후보 경로와 출처 표기.
 */
export async function getDirections(
  start: Point & { entrance?: Point },
  end: Point & { entrance?: Point },
  mode: TravelMode,
  signal?: AbortSignal,
): Promise<{ paths: Journey[]; attribution: string }> {
  return (
    await apiClient.get('/mobility/directions', {
      params: {
        startLatitude: (start.entrance ?? start).latitude,
        startLongitude: (start.entrance ?? start).longitude,
        endLatitude: (end.entrance ?? end).latitude,
        endLongitude: (end.entrance ?? end).longitude,
        mode,
      },
      signal,
    })
  ).data;
}
