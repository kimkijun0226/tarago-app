/** @fileoverview 여러 타일의 정류장 응답을 서버 정류장 ID 기준으로 합치는 순수 결합 함수를 제공한다. */

import type { BusStop } from '../api/get-nearby-bus-stops';

/**
 * 타일 경계에서 겹치는 정류장을 ID로 합친다. 같은 ID는 뒤쪽 타일 응답을 사용한다.
 * @param results 아직 응답이 없는 타일도 포함한 Query 결과 목록.
 * @returns 서버 정류장 ID가 중복되지 않는 목록.
 */
export function combineBusStops(results: { data?: BusStop[] }[]) {
  /** 타일 응답들을 정류장 ID로 합친 Map이며 같은 ID는 뒤쪽 응답을 유지한다. */
  const stops = new Map(results.flatMap(({ data = [] }) => data).map((stop) => [stop.id, stop]));
  return [...stops.values()];
}
