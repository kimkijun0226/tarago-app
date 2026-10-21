/** @fileoverview 노선 경유 순번·공식 도로 형상·차량 위치의 서버 계약과 상세 조회 요청을 정의한다. */

import type { BusArrival } from './get-bus-arrivals';
import { apiClient } from '@/shared/api/client';

/** 도로 형상은 공식 데이터가 있을 때만 전달한다. 차량 순번은 GPS 좌표가 아니다. */
export type BusRouteDetail = {
  routeId: string;
  busNumber: string;
  routeType: string;
  selectedStationId: string;
  selectedStationSeq: number;
  turnStationSeq: number | null;
  stops: {
    stationId: string;
    stationSeq: number;
    mobileNo: string | null;
    name: string;
    latitude: number;
    longitude: number;
  }[];
  geometry: {
    source: 'official' | 'unavailable';
    points: { latitude: number; longitude: number }[];
  };
  vehicles: (
    | { vehicleId: string; stationSeq: number; positionSource: 'station_sequence' }
    | {
        vehicleId: string;
        stationSeq: number;
        positionSource: 'gps';
        latitude: number;
        longitude: number;
      }
  )[];
};

/**
 * 선택 정류장의 정확한 경유 순번을 전달해 왕복 노선을 구별한다.
 * @param stationId 서버 정류장 UUID.
 * @param routeId 선택 노선 ID.
 * @param stationSeq 선택 정류장의 경유 순번.
 * @param signal 선택 변경 또는 화면 이탈 시 요청을 취소하는 신호.
 * @returns 경유 정류장·공식 형상·차량 위치를 포함한 노선 상세.
 * @throws 요청 실패 시 Axios 오류를 호출한 Query로 전달한다.
 */
export async function getBusRouteDetail(
  stationId: string,
  routeId: string,
  stationSeq: number,
  signal?: AbortSignal,
  overview = false,
  source?: BusArrival['routeSource'],
) {
  /** 공유 HTTP 클라이언트의 응답이며 호출자에게 본문 데이터만 전달한다. */
  const response = await apiClient.get<BusRouteDetail>(
    `/bus/stations/${stationId}/routes/${routeId}`,
    { params: { stationSeq, ...(overview ? { overview: true } : {}),
      ...(source ? { sourceProvider: source.provider, sourceStationId: source.stationId } : {}) }, signal },
  );
  return response.data;
}
