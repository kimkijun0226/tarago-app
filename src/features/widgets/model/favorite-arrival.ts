import { LINE_COLORS } from '@/features/subway/model/subway-line-colors';
import { getBusRouteBadge } from '@/features/bus-stop/model/bus-arrival';
import type { BusArrival } from '@/features/bus-stop/api/get-bus-arrivals';
import type { SubwayArrival, SubwayArrivals } from '@/features/subway/api/get-subway-arrivals';
import type { SubwayStationLine, SubwayTimetable } from '@/features/subway/api/get-subway-station';
import {
  isExpressTrain,
  matchesSubwayDestination,
  normalizeSubwayDirections,
  normalizeSubwayDirection,
} from '@/features/subway/model/subway-direction';
import {
  getArrivalTime,
  getScheduledArrivals,
  getScheduledDepartureAt,
  getUpcomingTrains,
  isUsableSubwayArrival,
} from '@/features/subway/model/subway-arrival-display';
import type { WidgetTarget } from './widget-configuration';

type ArrivalQuery<T> = {
  data?: T;
  dataUpdatedAt: number;
  errorUpdatedAt: number;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
};

export function matchesFavoriteSubwayTrain(
  item: Pick<Extract<WidgetTarget, { transport: 'subway' }>, 'lineId' | 'expressOnly' | 'destination' | 'destinations'>,
  direction: string,
  train: SubwayArrival,
) {
  return (
    train.lineId === item.lineId &&
    (direction === 'all' || train.direction === direction) &&
    matchesSubwayDestination(item, train.destination) &&
    (!item.expressOnly || isExpressTrain(train))
  );
}

export function getFavoriteLiveTrains(
  item: Extract<WidgetTarget, { transport: 'subway' }>,
  source: SubwayArrival[],
  fetchedAt: number,
  now: number,
  line?: Pick<SubwayStationLine, 'lineId' | 'stationNumber'>,
) {
  const currentLine = line ?? { lineId: item.lineId, stationNumber: '' };
  const direction = normalizeSubwayDirection(currentLine, item.direction, source);
  return getUpcomingTrains(normalizeSubwayDirections(currentLine, source).arrivals.filter((train) =>
    matchesFavoriteSubwayTrain(item, direction, train) &&
    isUsableSubwayArrival(train, fetchedAt, now),
  ));
}

/** 즐겨찾기 화면의 도착 예정 시각과 운행 상태를 공통 Query 결과로 계산한다. */
export function buildFavoriteArrival(
  item: WidgetTarget,
  bus: ArrivalQuery<BusArrival[]>,
  subway: ArrivalQuery<SubwayArrivals>,
  now: number,
  line?: Pick<SubwayStationLine, 'lineId' | 'stationNumber'>,
  timetable?: SubwayTimetable,
) {
  const query = item.transport === 'bus' ? bus : subway;
  let color =
    item.color ?? (item.transport === 'subway' ? LINE_COLORS[item.title] : undefined) ?? '#2869DB';
  let direction = item.directionLabel;
  let time = '—';
  let remainingSeconds: number | null = null;
  let realtimeError = false;
  // 응답을 받은 순간에는 API의 ETA를 그대로 표시하고 이후 경과 시간만 뺀다.
  const eta = (seconds: number, fetchedAt: number, qualifier = '') => {
    const left = seconds - Math.max(0, now - fetchedAt) / 1000;
    const maxAge = qualifier.includes('배차') ? 86_400_000 : 90_000;
    if (now - fetchedAt < maxAge && left >= -15) remainingSeconds = Math.max(0, left);
    return now - fetchedAt >= maxAge
      ? '—'
      : left < -15
        ? '—'
        : left <= 60
          ? `${qualifier}곧 도착`
          : `${qualifier}${Math.ceil(left / 60)}분`;
  };
  if (item.transport === 'bus' && bus.data !== undefined) {
    const arrivals = (bus.data ?? [])
      .filter(
        (arrival) =>
          arrival.routeId === item.routeId &&
          (item.stationSeq === undefined || arrival.stationSeq === item.stationSeq),
      )
      .sort((a, b) => (a.etaSeconds ?? Infinity) - (b.etaSeconds ?? Infinity));
    const first = arrivals[0];
    if (first) {
      realtimeError = first.realtimeError ?? false;
      color = getBusRouteBadge(first.routeType)?.color ?? color;
      direction =
        first.direction || (first.nextStopName ? `${first.nextStopName} 방면` : direction);
      if (first.etaSeconds !== null)
        time = eta(
          first.etaSeconds,
          bus.dataUpdatedAt,
          first.etaSource === 'schedule_estimate'
            ? '배차 기준 예상 '
            : first.etaSource
              ? '예상 '
              : first.etaPrecision
                ? '약 '
                : '',
        );
      else if (first.nextDepartureAt && Number.isFinite(Date.parse(first.nextDepartureAt))) {
        const departure = Date.parse(first.nextDepartureAt);
        const day =
          Math.floor((departure + 9 * 3_600_000) / 86_400_000) -
          Math.floor((now + 9 * 3_600_000) / 86_400_000);
        const clock = new Intl.DateTimeFormat('ko-KR', {
          timeZone: 'Asia/Seoul',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(departure);
        const date =
          day === 0
            ? '오늘'
            : day === 1
              ? '내일'
              : new Intl.DateTimeFormat('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  month: 'numeric',
                  day: 'numeric',
                }).format(departure);
        time = first.serviceEnded && !first.scheduleError
          ? now >= departure
            ? '—'
            : '운행 종료'
          : `첫차 출발 전\n${date} ${clock}\n${first.departureStopName ?? '기점'} 출발 예정`;
      } else {
        time = first.serviceEnded && !first.scheduleError ? '운행 종료' : '—';
      }

    }
  } else if (item.transport === 'subway' && (subway.data !== undefined || timetable !== undefined)) {
    const source = subway.data?.arrivals ?? [];
    const currentLine = line ?? { lineId: item.lineId, stationNumber: '' };
    const selectedDirection = normalizeSubwayDirection(currentLine, item.direction, source);
    const normalized = normalizeSubwayDirections(currentLine, source, timetable?.directions);
    const liveFetchedAt = Date.parse(subway.data?.fetchedAt ?? '');
    const trains = getFavoriteLiveTrains(item, source, liveFetchedAt, now, line);
    const fallback =
      !trains.some((train) => train.etaSource !== 'estimated' && train.etaSource !== 'schedule') && timetable
        ? getUpcomingTrains(
            getScheduledArrivals(normalized.scheduled, item.lineId, item.title, now).filter(
              (train) => matchesFavoriteSubwayTrain(item, selectedDirection, train),
            ),
          )
        : [];
    const official = trains.find((train) => train.etaSource !== 'estimated' && train.etaSource !== 'schedule');
    const first = official ?? fallback[0] ?? trains[0];
    if (!first && timetable && !timetable.stale) {
      const matching = normalized.scheduled
        .filter((entry) => selectedDirection === 'all' || entry.direction === selectedDirection)
        .flatMap((entry) => {
          const filtered = entry.trains.filter((train) =>
            matchesSubwayDestination(item, train.destination) && (!item.expressOnly || train.isExpress),
          );
          const lastTrain = filtered.at(-1) ?? (
            !item.destination && !item.destinations?.length && !item.expressOnly ? entry.lastTrain : null
          );
          return lastTrain ? [{ ...entry, lastTrain }] : [];
        });
      if (matching.length && matching.every((entry) =>
        now > getScheduledDepartureAt(entry.lastTrain.departureTime, now),
      )) time = '운행 종료';
    }
    if (first) {
      direction = `${item.directionLabel} · ${first.destination.replace(/행$/, '')}행`;
      const fetchedAt = first === fallback[0] ? now : liveFetchedAt;
      if (!Number.isFinite(fetchedAt) || now - fetchedAt >= 90_000) time = '—';
      else if (first.arrivalCode === '0') time = '진입';
      else if (first.arrivalCode === '1') time = '도착';
      else if (first.etaSeconds !== null && first.etaSeconds > 0)
        time = eta(
          first.etaSeconds,
          fetchedAt,
          first.etaSource === 'schedule'
            ? '시간표 '
            : first.etaSource === 'estimated'
              ? '예상 '
              : '',
        );
      else
        time =
          getArrivalTime(first, now, Math.max(0, now - fetchedAt) / 1000).text || '—';
    }
  }
  const loading =
    query.isPending ||
    (query.isFetching &&
      time === '—');
  return {
    direction,
    time,
    color,
    remainingSeconds,
    loading,
    reportProblem: (query.isError && remainingSeconds === null && time === '—') || realtimeError,
    realtimeError,
  };
}
