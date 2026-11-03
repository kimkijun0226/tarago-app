import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBusArrivals } from '@/features/bus-stop/api/get-bus-arrivals';
import { useFocusEffect } from 'expo-router';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import { matchesSubwayDestination } from '@/features/subway/model/subway-direction';
import { getUpcomingTrains } from '@/features/subway/model/subway-arrival-display';
import type { WidgetTarget } from './widget-configuration';

/** 미리보기는 기존 Query 캐시만 구독하며 추가 API 폴링을 시작하지 않는다. */
export function useWidgetArrival(item: WidgetTarget, live = true) {
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(Date.now);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (!focused) return;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [focused]);
  const liveBus = useBusArrivals(
    live && item.transport === 'bus' ? item.stationId : '',
    live && focused && item.transport === 'bus',
  );
  // 미리보기의 비활성 구독이 목록의 진행 중 요청을 취소하지 않도록 조회 훅의 정리 동작을 피한다.
  const cachedBus = useQuery({
    queryKey: ['bus-stops', item.transport === 'bus' ? item.stationId : '', 'arrivals'],
    queryFn: ({ signal }) =>
      getBusArrivals({ stationId: item.transport === 'bus' ? item.stationId : '', signal }),
    enabled: false,
  });
  const bus = live ? liveBus : cachedBus;
  const subway = useSubwayArrivals(
    item.transport === 'subway' ? item.stationName : '',
    item.transport === 'subway' ? item : undefined,
    live,
  );
  const query = item.transport === 'bus' ? bus : subway;
  let direction = item.directionLabel;
  let time = query.isPending ? '조회 중' : query.isError ? '재조회 필요' : '정보 없음';
  const eta = (seconds: number, fetchedAt: number, qualifier = '') => {
    const left = seconds - Math.max(0, now - fetchedAt) / 1000;
    return now - fetchedAt >= 90_000
      ? '갱신 필요'
      : left < -15
        ? '다음 도착 확인'
        : left <= 60
          ? `${qualifier}곧 도착`
          : `${qualifier}${Math.ceil(left / 60)}분`;
  };
  if (item.transport === 'bus') {
    const first = (bus.data ?? [])
      .filter(
        (arrival) =>
          arrival.routeId === item.routeId &&
          (item.stationSeq === undefined || arrival.stationSeq === item.stationSeq),
      )
      .sort((a, b) => (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity))[0];
    if (first) {
      direction =
        first.direction || (first.nextStopName ? `${first.nextStopName} 방면` : direction);
      if (first.etaSeconds !== null)
        time = eta(
          first.etaSeconds,
          bus.dataUpdatedAt,
          first.etaSource ? '예상 ' : first.etaPrecision ? '약 ' : '',
        );
      else if (first.serviceStatus === 'turnaround_waiting') time = '회차 대기';
    }
  } else {
    const first = getUpcomingTrains(
      (subway.data?.arrivals ?? []).filter(
        (train) =>
          train.lineId === item.lineId &&
          (item.direction === 'all' || train.direction === item.direction) &&
          matchesSubwayDestination(item, train.destination),
      ),
    )[0];
    if (first) {
      direction = `${item.directionLabel} · ${first.destination.replace(/행$/, '')}행`;
      const fetchedAt = Date.parse(subway.data?.fetchedAt ?? '');
      if (!Number.isFinite(fetchedAt) || now - fetchedAt >= 90_000) time = '갱신 필요';
      else if (first.arrivalCode === '0') time = '진입';
      else if (first.arrivalCode === '1') time = '도착';
      else if (first.etaSeconds !== null)
        time = eta(
          first.etaSeconds,
          fetchedAt,
          first.etaSource === 'schedule'
            ? '시간표 '
            : first.etaSource === 'estimated'
              ? '예상 '
              : '',
        );
    }
  }
  return { direction, time };
}
