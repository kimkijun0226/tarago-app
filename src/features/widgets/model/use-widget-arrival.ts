import { buildFavoriteArrival } from './favorite-arrival';
import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBusArrivals } from '@/features/bus-stop/api/get-bus-arrivals';
import { useFocusEffect } from 'expo-router';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { useSubwayStation, useSubwayTimetable } from '@/features/subway/model/use-subway-station';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import type { WidgetTarget } from './widget-configuration';

/** 즐겨찾기도 지도와 같은 역별 Query를 공유하고 저장된 방면·행선지만 화면에서 고른다. */
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
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [focused, live]);
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
    undefined,
    live,
  );
  const station = useSubwayStation(item.transport === 'subway' ? item.stationName : '');
  const line =
    item.transport === 'subway'
      ? station.data?.lines.find((line) => line.lineId === item.lineId)
      : undefined;
  const needsSchedule =
    item.transport === 'subway' &&
    !subway.isPending &&
    !subway.isError &&
    !(subway.data?.arrivals ?? []).some((train) => train.lineId === item.lineId);
  const day = new Date(now + 6 * 3_600_000).getUTCDay();
  const timetable = useSubwayTimetable(
    item.transport === 'subway' ? item.stationName : '',
    item.transport === 'subway' ? item.lineId : '',
    day === 0 ? 'holiday' : day === 6 ? 'saturday' : 'weekday',
    live && focused && needsSchedule,
  );
  const result = buildFavoriteArrival(
    item,
    bus,
    subway,
    now,
    line,
    needsSchedule ? timetable.data : undefined,
  );
  return {
    ...result,
    loading: result.loading || (needsSchedule && timetable.isPending && live && focused),
    time: needsSchedule && timetable.isError ? '시간표 조회 오류 · 의견 보내기' : result.time,
  };
}
