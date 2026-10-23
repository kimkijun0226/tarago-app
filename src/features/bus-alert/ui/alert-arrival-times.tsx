/** @fileoverview 저장된 알림의 노선·방향에 해당하는 첫 두 차량을 기존 도착 Query로 표시한다. */
import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/shared/model/app-store';
import { useFocusEffect } from 'expo-router';
import { AppState, Text, View } from 'react-native';
import { isAlertQueryWindow } from '../model/alert-query-window';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { formatEta, groupBusArrivals } from '@/features/bus-stop/model/bus-arrival';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import type { SubwayAlert } from '@/features/subway/model/subway-alert';
import type { BusAlert } from '../model/bus-alert';
import { alertColors as colors } from './alert-design';

type Props = ({ transport: 'bus'; alert: BusAlert } | { transport: 'subway'; alert: SubwayAlert }) & { kind: 'time' | 'location' };

export function AlertArrivalTimes(props: Props) {
  const { alert } = props;
  const [queryNow, setQueryNow] = useState(Date.now);
  useFocusEffect(useCallback(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      setQueryNow(Date.now());
      timer = setTimeout(refresh, 60_000 - Date.now() % 60_000);
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
      else clearTimeout(timer);
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, []));
  const inside = useAppStore((state) =>
    state.proximityVisits[`${props.transport}:${alert.id}`]?.inside === true,
  );
  const scheduledEnabled =
    props.transport === 'subway' ? alert.scheduledEnabled !== false : alert.scheduledEnabled;
  if (!alert.enabled) return null;
  if (props.kind === 'location' ? !alert.proximityEnabled || !inside : !scheduledEnabled || !isAlertQueryWindow(alert, queryNow))
    return null;
  return <ActiveAlertArrivalTimes {...props} />;
}

/** 비활성화 시 구독을 해제해 다른 활성 카드의 공유 Query는 유지한다. */
function ActiveAlertArrivalTimes(props: Props) {
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
  const bus = useBusArrivals(
    props.transport === 'bus' ? props.alert.stationId : '',
    focused && props.transport === 'bus',
  );
  const subway = useSubwayArrivals(props.transport === 'subway' ? props.alert.stationName : '');
  const query = props.transport === 'bus' ? bus : subway;
  let times: string[] = [];
  if (props.transport === 'bus') {
    const { alert } = props;
    const seen = new Set<string>();
    const selected = (bus.data ?? []).filter((arrival) => {
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
    const group = now - bus.dataUpdatedAt < 90_000 ? groupBusArrivals(selected)[0] : undefined;
    times = [group?.first, group?.second]
      .filter((arrival) => !!arrival)
      .map((arrival) =>
        formatEta(
          arrival.etaSeconds === null
            ? null
            : Math.max(0, arrival.etaSeconds - Math.max(0, now - bus.dataUpdatedAt) / 1000),
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
            train.direction === alert.direction &&
            (!alert.destination || train.destination === alert.destination) &&
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
            `${train.etaSource === 'estimated' ? '예상 ' : ''}${formatEta(Math.max(0, train.etaSeconds! - Math.max(0, now - fetched) / 1000))}${train.destination ? ` · ${train.destination.replace(/행$/, '')}행` : ''}`,
        );
    }
  }
  if (query.isPending || query.isError) {
    return (
      <Text style={{ color: colors.secondaryText, fontSize: 13 }}>
        {query.isError ? '도착정보를 불러오지 못했어요' : '도착정보 확인 중'}
      </Text>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {[0, 1].map((index) => (
        <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: colors.secondaryText, fontSize: 12 }}>
            {index ? '두 번째' : '첫 번째'}
          </Text>
          <Text
            style={{
              flex: 1,
              color: times[index] ? colors.accent : colors.secondaryText,
              fontSize: 15,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
            }}
          >
            {times[index] ?? '정보 없음'}
          </Text>
        </View>
      ))}
    </View>
  );
}
