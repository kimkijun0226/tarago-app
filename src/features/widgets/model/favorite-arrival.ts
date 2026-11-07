import { LINE_COLORS } from '@/features/subway/model/subway-line-colors';
import { getBusRouteBadge } from '@/features/bus-stop/model/bus-arrival';
import type { BusArrival } from '@/features/bus-stop/api/get-bus-arrivals';
import type { SubwayArrivals } from '@/features/subway/api/get-subway-arrivals';
import type { SubwayStationLine, SubwayTimetable } from '@/features/subway/api/get-subway-station';
import {
  matchesSubwayDestination,
  normalizeSubwayDirections,
  normalizeSubwayDirection,
} from '@/features/subway/model/subway-direction';
import {
  getArrivalTime,
  getScheduledArrivals,
  getUpcomingTrains,
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
  let time = query.isPending
    ? '조회 중'
    : query.isError
      ? '조회 오류 · 의견 보내기'
      : item.transport === 'bus'
        ? '도착시간 미제공'
        : '조회된 도착 열차 없음';
  let remainingSeconds: number | null = null;
  let realtimeError = false;
  let statusMessage = time;
  const eta = (seconds: number, fetchedAt: number, qualifier = '') => {
    const left = seconds - Math.max(0, now - fetchedAt) / 1000;
    const maxAge = qualifier.includes('배차') ? 86_400_000 : 90_000;
    if (now - fetchedAt < maxAge && left >= -15) remainingSeconds = Math.max(0, left);
    return now - fetchedAt >= maxAge
      ? '도착정보 갱신 필요'
      : left < -15
        ? '예정 시각 지남'
        : left <= 60
          ? `${qualifier}곧 도착`
          : `${qualifier}${Math.ceil(left / 60)}분`;
  };
  if (item.transport === 'bus' && !query.isError) {
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
      statusMessage =
        first.serviceStatus === 'turnaround_waiting'
          ? '회차지에서 출발 전'
          : first.serviceStatus === 'on_route'
            ? '운행 중 · 도착시간 미제공'
            : first.serviceStatus === 'before_turnaround'
              ? '회차 전 · 도착시간 미제공'
              : '도착시간 미제공';
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
        time = first.serviceEnded
          ? now >= departure
            ? '도착시간 재조회 중'
            : '운행 종료'
          : `첫차 출발 전\n${date} ${clock}\n${first.departureStopName ?? '기점'} 출발 예정`;
      } else {
        time = statusMessage;
      }
      if (first.recheckingArrival && !realtimeError) {
        const end = Date.parse(first.serviceEndAt ?? '');
        time = Number.isFinite(end) && now >= end ? '운행 종료' : '도착시간 재조회 중';
        remainingSeconds = null;
      }
    }
  } else if (item.transport === 'subway' && !query.isError) {
    const source = subway.data?.arrivals ?? [];
    const currentLine = line ?? { lineId: item.lineId, stationNumber: '' };
    const selectedDirection = normalizeSubwayDirection(currentLine, item.direction, source);
    const normalized = normalizeSubwayDirections(currentLine, source, timetable?.directions);
    const trains = getUpcomingTrains(
      normalized.arrivals.filter(
        (train) =>
          train.lineId === item.lineId &&
          (selectedDirection === 'all' || train.direction === selectedDirection) &&
          matchesSubwayDestination(item, train.destination),
      ),
    );
    const fallback =
      !trains.length && timetable
        ? getUpcomingTrains(
            getScheduledArrivals(normalized.scheduled, item.lineId, item.title, now).filter(
              (train) =>
                (selectedDirection === 'all' || train.direction === selectedDirection) &&
                matchesSubwayDestination(item, train.destination),
            ),
          )
        : [];
    const first = trains[0] ?? fallback[0];
    if (first) {
      direction = `${item.directionLabel} · ${first.destination.replace(/행$/, '')}행`;
      const fetchedAt = fallback.length ? now : Date.parse(subway.data?.fetchedAt ?? '');
      if (!Number.isFinite(fetchedAt) || now - fetchedAt >= 90_000) time = '도착정보 갱신 필요';
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
          getArrivalTime(first, now, Math.max(0, now - fetchedAt) / 1000).text || '도착시간 미제공';
    }
  }
  const loading =
    query.isPending ||
    (query.isFetching &&
      ['도착정보 갱신 필요', '조회 오류 · 의견 보내기', '예정 시각 지남'].includes(time));
  return {
    direction,
    time,
    color,
    remainingSeconds,
    loading,
    reportProblem: query.isError || realtimeError,
    realtimeError,
  };
}
