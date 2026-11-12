/** @fileoverview 정류장 도착 Query의 폴링·재시도와 폐쇄 정류장의 지도 캐시 제거를 관리한다. */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useIsFocused } from 'expo-router';
import { isAxiosError, isCancel } from 'axios';
import { mergeBusArrivals } from './merge-bus-arrivals';
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
  const focused = useIsFocused();

  const enrichedKey = ['bus-stops', stationId, 'arrivals-enriched'] as const;
  const enriched = useQuery({
    queryKey: enrichedKey,
    queryFn: ({ signal }) => getBusArrivals({ stationId, signal }),
    enabled: false,
  });
  const official = useQuery({
    queryKey: ['bus-stops', stationId, 'arrivals'],
    queryFn: async ({ signal }) => {
      const officialRequest = getBusArrivals({ stationId, signal, officialOnly: true });
      void client.fetchQuery({
        queryKey: enrichedKey,
        queryFn: ({ signal: enrichmentSignal }) => getBusArrivals({ stationId, signal: enrichmentSignal }),
        retry: false,
      }).catch(() => {
        // The official query owns the user-facing status.
      });
      return officialRequest;
    },
    enabled: Boolean(stationId) && enabled && focused,
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchInterval: ({ state }) =>
      isAxiosError(state.error) && state.error.response?.status === 410
        ? false
        : BUS_ARRIVALS_REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!isAxiosError(official.error) || official.error.response?.status !== 410) return;
    client.setQueriesData<BusStop[]>({ queryKey: ['bus-stops', 'tile'] }, (stops) =>
      stops?.filter((stop) => stop.id !== stationId),
    );
    void client.cancelQueries({ queryKey: ['bus-stops', stationId, 'arrivals-enriched'], exact: true });
  }, [client, official.error, stationId]);

  const closed = isAxiosError(official.error) && official.error.response?.status === 410;
  const fallback = useMemo(() => enriched.isError ||
      (official.isError && enriched.dataUpdatedAt < official.dataUpdatedAt)
    ? enriched.data?.filter((arrival) => arrival.etaSeconds === null || arrival.etaSource)
    : enriched.data, [enriched.data, enriched.dataUpdatedAt, enriched.isError, official.dataUpdatedAt, official.isError]);
  const merged = useMemo(() => closed ? undefined : mergeBusArrivals(
    official.isError ? undefined : official.data, official.dataUpdatedAt, fallback, enriched.dataUpdatedAt,
  ), [closed, official.isError, official.data, official.dataUpdatedAt, fallback, enriched.dataUpdatedAt]);
  return {
    ...official,
    data: merged,
    dataUpdatedAt: merged === fallback ? enriched.dataUpdatedAt : official.dataUpdatedAt,
    isPending: official.isPending && merged === undefined,
    isError: official.isError && (closed || !merged?.length),
    isEnriching: enriched.isFetching,
    refreshDelayed: official.isError && isAxiosError(official.error) &&
      !isCancel(official.error) && !closed,
  };
}
