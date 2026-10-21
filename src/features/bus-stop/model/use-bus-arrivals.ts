/** @fileoverview 정류장 도착 Query의 폴링·재시도와 폐쇄 정류장의 지도 캐시 제거를 관리한다. */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isAxiosError } from 'axios';
import type { BusStop } from '../api/get-nearby-bus-stops';

import { getBusArrivals } from '@/features/bus-stop/api/get-bus-arrivals';

/** 화면 도착정보의 자동 갱신 주기다. 새로고침 버튼도 같은 값을 표시한다. */
export const BUS_ARRIVALS_REFRESH_INTERVAL = 15_000;

/**
 * 선택한 정류장의 차량별 도착 정보를 서버 상태로 관리한다.
 *
 * 시트가 열려 있는 동안 15초마다 갱신한다. 앱이 background에 있을 때는
 * 이 폴링에 의존하지 않으며, 예약 알림 감시는 서버 Worker가 맡는다.
 * @param stationId 서버 DB의 정류장 UUID.
 * @returns 도착 목록, 조회·오류 상태, 수동 재조회 함수를 담은 Query 결과.
 */
export function useBusArrivals(stationId: string, enabled = true) {
  /** 폐쇄 정류장을 지도 타일 캐시에서도 제거하기 위한 Query 클라이언트다. */
  const client = useQueryClient();

  /** 도착 목록과 요청 상태·재시도·폴링을 소유하는 Query 결과다. */
  const query = useQuery({
    queryKey: ['bus-stops', stationId, 'arrivals'],
    queryFn: ({ signal }) => getBusArrivals({ stationId, signal }),
    enabled: Boolean(stationId) && enabled,
    staleTime: 5_000,
    retry: (count, error) =>
      !(isAxiosError(error) && [410, 429, 503].includes(error.response?.status ?? 0)) && count < 2,
    refetchInterval: (current) =>
      isAxiosError(current.state.error) && current.state.error.response?.status === 410
        ? false
        : BUS_ARRIVALS_REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
  });

  /** 축소 상태로 전환하면 진행 중인 요청과 재시도도 중단한다. */
  useEffect(() => {
    if (!enabled)
      void client.cancelQueries({ queryKey: ['bus-stops', stationId, 'arrivals'], exact: true });
  }, [client, enabled, stationId]);

  /**
   * 공식 응답이 410일 때만 해당 정류장을 모든 타일 캐시에서 제외한다.
   * client·query.error·stationId가 바뀌면 최신 캐시와 정류장으로 다시 판단한다.
   * 동기 캐시 변경이며 구독·타이머를 만들지 않으므로 반환 정리 함수가 필요 없다.
   */
  useEffect(() => {
    if (!isAxiosError(query.error) || query.error.response?.status !== 410) return;
    // 정차 노선 없음이 공식 조회로 확인된 경우에만 지도 캐시에서 제외한다.
    client.setQueriesData<BusStop[]>({ queryKey: ['bus-stops', 'tile'] }, (stops) =>
      stops?.filter((stop) => stop.id !== stationId),
    );
  }, [client, query.error, stationId]);
  return query;
}
