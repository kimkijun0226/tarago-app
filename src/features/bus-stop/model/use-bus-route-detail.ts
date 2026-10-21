/** @fileoverview 선택 정류장 경유 순번별 노선 상세 Query와 화면 활성 중 차량 위치 갱신을 관리한다. */

import type { BusArrival } from '../api/get-bus-arrivals';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getBusRouteDetail, type BusRouteDetail } from '../api/get-bus-route-detail';

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
  source?: BusArrival['routeSource'],
) {
  const client = useQueryClient();
  const active = enabled && Boolean(stationId && routeId);
  const sourceKey = [source?.provider ?? '', source?.stationId ?? ''];
  const overview = useQuery<BusRouteDetail>({
    queryKey: ['bus-route-overview', stationId, routeId, stationSeq, ...sourceKey],
    queryFn: async ({ signal }) => {
      const result = await getBusRouteDetail(stationId, routeId, stationSeq, signal, true, source);
      client.setQueryData<BusRouteDetail>(['bus-route-stops', routeId, source?.provider ?? ''], previous =>
        result.geometry.source === 'official' || previous?.geometry.source !== 'official' ? result : previous);
      return result;
    },
    enabled: active,
    staleTime: 60 * 60_000,
    gcTime: 60 * 60_000,
    placeholderData: () => {
      const cached = client.getQueryData<Awaited<ReturnType<typeof getBusRouteDetail>>>([
        'bus-route-stops',
        routeId,
        source?.provider ?? '',
      ]);
      const stop = cached?.stops.find((item) => item.stationSeq === stationSeq);
      return cached && stop
        ? { ...cached, selectedStationId: stop.stationId, selectedStationSeq: stationSeq }
        : undefined;
    },
  });
  const detail = useQuery({
    queryKey: ['bus-route', stationId, routeId, stationSeq, ...sourceKey],
    queryFn: async ({ signal }) => {
      const result = await getBusRouteDetail(stationId, routeId, stationSeq, signal, false, source);
      if (result.geometry.source === 'official') client.setQueryData(['bus-route-stops', routeId, source?.provider ?? ''], result);
      return result;
    },
    enabled: active,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  return {
    ...detail,
    data: detail.data?.geometry.source === 'official' ? detail.data : overview.data ?? detail.data,
    isPending: !detail.data && overview.isPending,
    isError: !detail.data && !overview.data && overview.isError,
    error: detail.error ?? overview.error,
    refetch: () => Promise.all([overview.refetch(), detail.refetch()]),
  };
}
