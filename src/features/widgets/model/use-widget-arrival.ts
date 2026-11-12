import { buildFavoriteArrival, getFavoriteLiveTrains } from './favorite-arrival';
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { useSubwayStation, useSubwayTimetable } from '@/features/subway/model/use-subway-station';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import type { WidgetTarget } from './widget-configuration';

/** 즐겨찾기도 지도와 같은 역별 Query를 공유하고 저장된 방면·행선지만 화면에서 고른다. */
export function useWidgetArrival(item: WidgetTarget) {
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(Date.now);
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (!focused) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [focused]);
  const bus = useBusArrivals(
    item.transport === 'bus' ? item.stationId : '',
    focused && item.transport === 'bus',
  );
  const subway = useSubwayArrivals(item.transport === 'subway' ? item.stationName : '');
  const station = useSubwayStation(item.transport === 'subway' ? item.stationName : '');
  const line =
    item.transport === 'subway'
      ? station.data?.lines.find((line) => line.lineId === item.lineId)
      : undefined;
  const liveTrains = subway.data?.arrivals ?? [];
  const needsSchedule =
    item.transport === 'subway' &&
    !subway.isPending &&
    getFavoriteLiveTrains(item, liveTrains, subway.dataUpdatedAt, now, line).length === 0;
  const day = new Date(now + 6 * 3_600_000).getUTCDay();
  const timetable = useSubwayTimetable(
    item.transport === 'subway' ? item.stationName : '',
    item.transport === 'subway' ? item.lineId : '',
    day === 0 ? 'holiday' : day === 6 ? 'saturday' : 'weekday',
    focused && needsSchedule,
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
    loading: result.loading || (needsSchedule && timetable.isPending && focused),
    time: needsSchedule && timetable.isError && !timetable.data ? '갱신 지연' : result.time,
  };
}
