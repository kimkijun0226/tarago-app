/** @fileoverview 노선 상세 시트가 소비할 도착 차량 선택과 정류장별 차량 그룹화를 담당한다. */

import type { BusArrival } from '../api/get-bus-arrivals';
import type { BusRouteDetail } from '../api/get-bus-route-detail';

/**
 * 왕복 경유 순번을 구분해 선택 노선의 ETA가 있는 차량 두 대를 고른다.
 * @param arrivals 정류장의 전체 도착 응답. 원본 순서는 변경하지 않는다.
 * @param routeId 선택 노선 ID.
 * @param stationSeq 상세 응답 또는 화면에서 선택한 경유 순번.
 * @returns 도착 시간이 빠른 순서의 최대 두 차량.
 */
export function selectRouteArrivals(arrivals: BusArrival[], routeId: string, stationSeq: number) {
  return arrivals
    .filter(
      (arrival) =>
        arrival.routeId === routeId &&
        (arrival.stationSeq === undefined || arrival.stationSeq === stationSeq) &&
        arrival.etaSeconds !== null,
    )
    .sort((left, right) => left.etaSeconds! - right.etaSeconds!)
    .slice(0, 2);
}

/**
 * 목록 행마다 전체 차량을 다시 탐색하지 않도록 경유 순번으로 색인한다.
 * @param vehicles 서버가 마지막으로 확인한 차량 목록.
 * @returns 정류장 순번에 대응하는 차량 목록의 Map.
 */
export function groupRouteVehiclesByStop(vehicles: BusRouteDetail['vehicles']) {
  /** 정류장 경유 순번에 차량을 모아 행별 전체 탐색을 피하는 색인이다. */
  const grouped = new Map<number, BusRouteDetail['vehicles']>();

  /** vehicle은 경유 순번 색인에 넣을 현재 차량의 마지막 위치 응답이다. */
  for (const vehicle of vehicles) {
    /** 같은 경유 순번에서 마지막 위치가 확인된 차량 목록이다. */
    const atStop = grouped.get(vehicle.stationSeq) ?? [];
    atStop.push(vehicle);
    grouped.set(vehicle.stationSeq, atStop);
  }
  return grouped;
}
