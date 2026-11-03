import { useAppStore } from '@/shared/model/app-store';
import { AlertTodayChoice } from './alert-today-choice';
import { notificationPause } from '../model/notification-actions';
/** @fileoverview 저장된 알림의 노선·방향에 해당하는 첫 두 차량을 기존 도착 Query로 표시한다. */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { setNotificationPause } from '../api/alerts';
import { BUS_ARRIVALS_REFRESH_INTERVAL } from '@/features/bus-stop/model/use-bus-arrivals';
import { getBusArrivals } from '@/features/bus-stop/api/get-bus-arrivals';
import { formatEta, groupBusArrivals } from '@/features/bus-stop/model/bus-arrival';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import { matchesSubwayDestination } from '@/features/subway/model/subway-direction';
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
  const bus = useQuery({
    queryKey: ['bus-stops', stationId, 'arrivals'],
    queryFn: ({ signal }) => getBusArrivals({ stationId, signal }),
    enabled: props.active && focused && Boolean(stationId),
    staleTime: 5_000,
    retry: false,
    refetchInterval: BUS_ARRIVALS_REFRESH_INTERVAL,
    refetchIntervalInBackground: false,
  });
  const subway = useSubwayArrivals(
    props.transport === 'subway' ? props.alert.stationName : '',
    props.transport === 'subway' ? props.alert : undefined,
    props.active,
  );
  const busKey = props.transport === 'bus' ? `${props.alert.stationId}:${props.alert.routeId}:${props.alert.stationSeq ?? ''}` : '';
  const [recentBus, setRecentBus] = useState<{ key: string; at: number; data: NonNullable<typeof bus.data> }>();
  if (props.transport === 'bus' && bus.data && (recentBus?.key !== busKey || recentBus.at !== bus.dataUpdatedAt)) {
    const { alert } = props;
    const hasTime = bus.data.some((arrival) => arrival.routeId === alert.routeId
      && (alert.stationSeq === undefined || arrival.stationSeq === alert.stationSeq)
      && arrival.etaSeconds !== null);
    if (hasTime) setRecentBus({ key: busKey, at: bus.dataUpdatedAt, data: bus.data });
  }
  const query = props.transport === 'bus' ? bus : subway;
  let times: string[] = [];
  if (props.transport === 'bus') {
    const { alert } = props;
    const seen = new Set<string>();
    const matches = (arrival: NonNullable<typeof bus.data>[number]) => arrival.routeId === alert.routeId
      && (alert.stationSeq === undefined || arrival.stationSeq === alert.stationSeq);
    const hasCurrent = bus.data?.some((arrival) => matches(arrival) && arrival.etaSeconds !== null);
    const recent = recentBus?.key === busKey && now - recentBus.at < 90_000 ? recentBus : undefined;
    const data = hasCurrent ? bus.data : recent?.data ?? bus.data;
    const observedAt = hasCurrent ? bus.dataUpdatedAt : recent?.at ?? bus.dataUpdatedAt;
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
    const group = now - observedAt < 90_000 ? groupBusArrivals(selected.filter((arrival) => arrival.etaSeconds === null || arrival.etaSeconds - Math.max(0, now - observedAt) / 1000 >= -15))[0] : undefined;
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
        ),
      );
  } else {
    const { alert } = props;
    const fetched = Date.parse(subway.data?.fetchedAt ?? '');
    if (Number.isFinite(fetched) && now - fetched < 90_000 && fetched - now < 30_000) {
      times = (subway.data?.arrivals ?? [])
        .filter(
          (train) =>
            train.lineId === alert.lineId &&
            (alert.direction === 'all' || train.direction === alert.direction) &&
            matchesSubwayDestination(alert, train.destination) &&
            train.arrivalCode !== '2' &&
            train.etaSeconds !== null &&
            train.etaSeconds >= 0,
        )
        .sort((a, b) => a.etaSeconds! - b.etaSeconds!)
        .filter(
          (train, index, trains) =>
            !train.trainId ||
            trains.findIndex((other) => other.trainId === train.trainId) === index,
        )
        .slice(0, 2)
        .map(
          (train) =>
            `${train.etaSource === 'schedule' ? '시간표 기준 · ' : train.etaSource === 'estimated' ? '예상 ' : ''}${formatEta(Math.max(0, train.etaSeconds! - Math.max(0, now - fetched) / 1000))}${train.destination ? ` · ${train.destination.replace(/행$/, '')}행` : ''}`,
        );
    }
  }
  return (
    <View style={{ gap: 6 }}>
      {[0, 1].map((index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: colors.secondaryText, fontSize: 10 }}>
            {index ? '두 번째' : '첫 번째'}
          </Text>
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={{
              flex: 1,
              textAlign: 'right',
              color: times[index] ? '#E5484D' : colors.secondaryText,
              fontSize: 14,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
            }}
          >
            {times[index] ?? (!props.active ? '꺼짐' : query.isPending ? '조회 중' : '확인 중')}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** 예약 자체를 유지한 채 오늘 받을 알림만 제어한다. */
export function AlertTodayControl(props: Props & { busy: boolean }) {
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
      disabled={!alert.enabled || props.busy || control.isPending}
      value={alert.enabled && !paused}
      onChange={(active) => control.mutate(!active)}
    />
  );
}
