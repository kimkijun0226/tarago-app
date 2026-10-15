/** @fileoverview 선택 정류장 경유 순번별 노선 상세 Query와 화면 활성 중 차량 위치 갱신을 관리한다. */

import { useQuery } from '@tanstack/react-query';

import { getBusRouteDetail } from '../api/get-bus-route-detail';

/**
 * 상세 화면이 열린 동안만 차량 순번을 갱신한다.
 * Query가 캐시와 함수 실행을 관리하므로 요청 함수를 별도 useCallback으로 감싸지 않는다.
 * @param stationId 서버 정류장 UUID.
 * @param routeId 선택한 노선 ID.
 * @param stationSeq 왕복 경유를 구분하는 정류장 순번.
 * @param enabled 상세 조회 활성 여부.
 * @returns 상세 응답과 로딩·오류·재조회 상태를 담은 Query 결과.
 */
export function useBusRouteDetail(
  stationId: string,
  routeId: string,
  stationSeq: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ['bus-route', stationId, routeId, stationSeq],
    queryFn: ({ signal }) => getBusRouteDetail(stationId, routeId, stationSeq, signal),
    enabled: enabled && Boolean(stationId && routeId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}
