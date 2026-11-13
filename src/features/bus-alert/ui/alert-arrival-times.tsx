import { ArrivalTimeSlot, useArrivalTimeRefreshing } from '@/shared/ui/arrival-time-entrance';
import { useAppStore } from '@/shared/model/app-store';
import { AlertTodayChoice } from './alert-today-choice';
import { notificationPause } from '../model/notification-actions';
/** @fileoverview 저장된 알림의 노선·방향에 해당하는 첫 두 차량을 기존 도착 Query로 표시한다. */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setNotificationPause } from '../api/alerts';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { formatEta, groupBusArrivals } from '@/features/bus-stop/model/bus-arrival';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import { useSubwayStation, useSubwayTimetable } from '@/features/subway/model/use-subway-station';
import { getScheduledArrivals, getScheduledDepartureAt, isUsableSubwayArrival } from '@/features/subway/model/subway-arrival-display';
import {
  isExpressTrain,
  matchesSubwayDestination,
  normalizeSubwayDirections,
  normalizeSubwayDirection,
} from '@/features/subway/model/subway-direction';
import type { SubwayAlert } from '@/features/subway/model/subway-alert';
import type { BusAlert } from '../model/bus-alert';
import { alertColors as colors } from './alert-design';

type Props = (
  { transport: 'bus'; alert: BusAlert } | { transport: 'subway'; alert: SubwayAlert }
) & { kind: 'time' | 'location' };

export function AlertArrivalTimes(props: Props) {
  const { alert } = props;
  return <ActiveAlertArrivalTimes {...props} active={alert.enabled} />;
}

/** 비활성화 시 구독을 해제해 다른 활성 카드의 공유 Query는 유지한다. */
function ActiveAlertArrivalTimes(props: Props & { active: boolean }) {
  const refreshing = useArrivalTimeRefreshing();
  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!focused) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [focused]);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const stationId = props.transport === 'bus' ? props.alert.stationId : '';
  const bus = useBusArrivals(stationId, props.active && focused, props.transport === 'bus' ? props.alert.routeId : undefined);
  const subway = useSubwayArrivals(
    props.transport === 'subway' ? props.alert.stationName : '',
    props.transport === 'subway' ? props.alert : undefined,
    props.active,
  );
  const subwayStationName =
    props.transport === 'subway' && props.active && focused ? props.alert.stationName : '';
  const station = useSubwayStation(subwayStationName);
  const day = new Date(now + 6 * 3_600_000).getUTCDay();
  const timetable = useSubwayTimetable(
    subwayStationName,
    props.transport === 'subway' ? props.alert.lineId : '',
    day === 0 ? 'holiday' : day === 6 ? 'saturday' : 'weekday',
    props.active && focused,
  );
  const query = props.transport === 'bus' ? bus : subway;
  let times: string[] = [];
  if (props.transport === 'bus') {
    const { alert } = props;
    const seen = new Set<string>();
    const data = bus.data;
    const observedAt = bus.dataUpdatedAt;
    const selected = (data ?? []).filter((arrival) => {
      if (
        arrival.routeId !== alert.routeId ||
        (alert.stationSeq !== undefined && arrival.stationSeq !== alert.stationSeq)
      )
        return false;
      if (!arrival.vehicleId) return true;
      if (seen.has(arrival.vehicleId)) return false;
      seen.add(arrival.vehicleId);
      return true;
    });
    const group =
      now - observedAt < 90_000
        ? groupBusArrivals(
            selected.filter(
              (arrival) =>
                arrival.etaSeconds === null ||
                arrival.etaSeconds - Math.max(0, now - observedAt) / 1000 >= -15,
            ),
          )[0]
        : undefined;
    times = [group?.first, group?.second]
      .filter((arrival) => !!arrival)
      .map((arrival) =>
        formatEta(
          arrival.etaSeconds === null
            ? null
            : Math.max(0, arrival.etaSeconds - Math.max(0, now - observedAt) / 1000),
          arrival.serviceStatus,
          arrival.etaPrecision,
          arrival.etaSource,
          arrival,
        ),
      );
    const hasUpcomingBus = selected.some(
      (arrival) =>
        arrival.etaSeconds !== null &&
        arrival.etaSeconds - Math.max(0, now - observedAt) / 1000 >= -15,
    );
    if (
      times.includes('운행 종료') &&
      !hasUpcomingBus &&
      !selected.some((arrival) => arrival.realtimeError)
    ) {
      times = ['운행 종료', '운행 종료'];
    }
  } else {
    const { alert } = props;
    const line = station.data?.lines.find((line) => line.lineId === alert.lineId) ?? {
      lineId: alert.lineId,
      stationNumber: '',
    };
    const source = subway.data?.arrivals ?? [];
    const normalized = normalizeSubwayDirections(line, source, timetable.data?.directions);
    const direction = normalizeSubwayDirection(line, alert.direction, source);
    const fetched = Date.parse(subway.data?.fetchedAt ?? '');
    const matches = (train: (typeof source)[number]) =>
      train.lineId === alert.lineId &&
      (direction === 'all' || train.direction === direction) &&
      matchesSubwayDestination(alert, train.destination) &&
      (!alert.expressOnly || isExpressTrain(train));
    const live = normalized.arrivals.filter((train) => matches(train) && isUsableSubwayArrival(train, fetched, now));
    const official = live.filter((train) => train.etaSource !== 'estimated' && train.etaSource !== 'schedule');
    const scheduled = getScheduledArrivals(normalized.scheduled, alert.lineId, alert.lineName ?? alert.lineId, now)
      .filter(matches);
    const candidates = official.length ? official : scheduled.length ? scheduled : live;
    times = candidates
      .sort((a, b) => (a.etaSeconds ?? 0) - (b.etaSeconds ?? 0))
      .filter((train, index, rows) => !train.trainId || rows.findIndex((row) => row.trainId === train.trainId) === index)
      .slice(0, 2)
      .map((train) => {
        const elapsed = train.etaSource === 'schedule' && candidates === scheduled ? 0 : Math.max(0, now - fetched) / 1000;
        const prefix = train.etaSource === 'schedule' ? '시간표 기준 · ' : train.etaSource === 'estimated' ? '예상 ' : '';
        const time = train.etaSeconds === null ? '곧 도착' : formatEta(Math.max(0, train.etaSeconds - elapsed));
        return `${prefix}${time}${train.destination ? ` · ${train.destination.replace(/행$/, '')}행` : ''}`;
      });
    if (!times.length && timetable.data && !timetable.data.stale) {
      const lastTrains = normalized.scheduled
        .filter((entry) => direction === 'all' || entry.direction === direction)
        .flatMap((entry) => entry.trains.filter((train) =>
          matchesSubwayDestination(alert, train.destination) && (!alert.expressOnly || train.isExpress),
        ).slice(-1));
      if (lastTrains.length && lastTrains.every((train) => now > getScheduledDepartureAt(train.departureTime, now))) {
        times = ['운행 종료'];
      }
    }
  }
  return (
    <View style={{ gap: 6 }}>
      {[0, 1].map((index) => (
          <ArrivalTimeSlot key={index} indicator alignRight animateEntrance={props.active && Boolean(times[index]) && times[index] !== '운행 종료'}
            pending={props.active && (refreshing || (!times[index] && query.isFetching))}>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={{
              textAlign: 'right',
              color: times[index] && /분|초|곧 도착/.test(times[index]) && !/시간표|예상|배차|재조회/.test(times[index])
                ? '#E5484D' : colors.secondaryText,
              fontSize: 14,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
            }}
          >
            {times[index] ?? (!props.active ? '꺼짐' : '—')}
          </Text>
          </ArrivalTimeSlot>
      ))}
    </View>
  );
}

/** 예약 자체를 유지한 채 오늘 받을 알림만 제어한다. */
export function AlertTodayControl(props: Props & { busy: boolean; editing?: boolean; onLongPress?: () => void }) {
  const { alert } = props;
  const client = useQueryClient();
  const setError = useAppStore((state) => state.setAlertRuntimeError);
  const control = useMutation({
    mutationFn: (paused: boolean) => setNotificationPause(props.transport, alert.id, paused),
    onSuccess: (result) => {
      const key = props.transport === 'bus' ? ['alerts', 'list'] : ['subway-alerts'];
      client.setQueryData<(BusAlert | SubwayAlert)[]>(key, (items) =>
        items?.map((item) =>
          item.id === alert.id
            ? { ...item, notificationControl: result.notificationControl }
            : item,
        ),
      );
      setError(null);
      void client.invalidateQueries({ queryKey: key });
    },
    onError: () => setError('알림 설정을 변경하지 못했어요. 연결을 확인해주세요.'),
  });
  const [now, setNow] = useState(Date.now);
  useFocusEffect(
    useCallback(() => {
      const refresh = () => setNow(Date.now());
      refresh();
      const timer = setInterval(refresh, 60_000);
      const subscription = AppState.addEventListener('change', refresh);
      return () => {
        clearInterval(timer);
        subscription.remove();
      };
    }, []),
  );
  const paused = Boolean(notificationPause(alert.notificationControl, props.kind, now));
  return (
    <AlertTodayChoice
      disabled={!alert.enabled || props.busy || props.editing || control.isPending}
      value={alert.enabled && !paused}
      onChange={(active) => control.mutate(!active)}
      onLongPress={props.onLongPress}
    />
  );
}
