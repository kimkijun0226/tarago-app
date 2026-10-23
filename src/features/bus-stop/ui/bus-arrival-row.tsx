/** @fileoverview 노선 번호 아래에 최대 두 차량의 도착정보를 나란히 표시하고 알림 진입을 제공한다. */

import type { BusArrival } from '../api/get-bus-arrivals';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { TransitAlertAction } from '@/shared/ui/transit-alert-action';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatEta, getBusRouteBadge, type BusArrivalGroup } from '../model/bus-arrival';

type Props = {
  group: BusArrivalGroup;
  onSelectRoute: (routeId: string, stationSeq: number, source?: BusArrival['routeSource']) => void;
  onConfigureAlert: (group: BusArrivalGroup, kind: 'time' | 'location') => void;
};

/** 지도 이동에 따른 부모 갱신을 memo로 차단한다. 서버가 주지 않는 방면·혼잡도는 추정하지 않는다. */
export const BusArrivalRow = memo(function BusArrivalRow({
  group,
  onSelectRoute,
  onConfigureAlert,
}: Props) {
  /** 해당 노선 유형의 배지 이름과 색상이다. */
  const badge = getBusRouteBadge(group.routeType);
  const direction = (group.first.direction || group.first.nextStopName || '').replace(
    /\s*방면$/,
    '',
  );

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.busNumber}번 노선 상세 보기`}
        onPress={() => onSelectRoute(group.routeId, group.stationSeq ?? 0, group.first.routeSource)}
        style={styles.content}
      >
        <View style={styles.routeInfo}>
          <View style={styles.heading}>
            {badge ? (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: `${badge.color}14`, borderColor: `${badge.color}30` },
                ]}
              >
                <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            ) : null}
            <Text style={styles.number}>{group.busNumber}</Text>
            {direction ? (
              <Text numberOfLines={1} style={styles.direction}>
                → {direction} 방면
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      <View style={styles.arrivalRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${group.busNumber}번 도착정보 상세 보기`}
          onPress={() =>
            onSelectRoute(group.routeId, group.stationSeq ?? 0, group.first.routeSource)
          }
          style={styles.times}
        >
          <ArrivalTime arrival={group.first} />
          {group.second ? (
            <>
              <Text style={styles.dot}>·</Text>
              <ArrivalTime arrival={group.second} />
            </>
          ) : null}
        </Pressable>
        <View style={styles.actions}>
          {(['time', 'location'] as const).map((kind) => (
            <TransitAlertAction
              key={kind}
              kind={kind}
              iconSize={26}
              label={`${group.busNumber}번 ${kind === 'time' ? '예약' : '위치'} 알림 설정`}
              onPress={() => onConfigureAlert(group, kind)}
            />
          ))}
        </View>
      </View>
    </View>
  );
});

/** 분 단위 원본의 정밀도를 보존하면서 두 차량을 한 줄에 표시한다. 작은 문자열 변환은 캐시하지 않는다. */
function ArrivalTime({ arrival }: { arrival: BusArrivalGroup['first'] }) {
  return (
    <View style={styles.arrivalTime}>
      <Text
        numberOfLines={1}
        style={[styles.eta, arrival.etaSeconds === null ? styles.secondary : styles.red]}
      >
        {formatEta(
          arrival.etaSeconds,
          arrival.serviceStatus,
          arrival.etaPrecision,
          arrival.etaSource,
        )}
      </Text>
      {arrival.remainingStops !== null && arrival.remainingStops > 0 ? (
        <Text numberOfLines={1} style={styles.remainingStops}>
          {arrival.remainingStops}정류장
        </Text>
      ) : null}
    </View>
  );
}

/** 정적인 스타일은 모듈에서 한 번 생성하므로 useMemo가 필요 없다. */
const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 0,
    paddingTop: 10,
    paddingBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEDEF',
    gap: 0,
    marginHorizontal: 16,
    marginVertical: 0,
    backgroundColor: '#FFFFFF',
  },
  content: { minWidth: 0, justifyContent: 'center' },
  routeInfo: { minWidth: 0 },
  badge: {
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '500', includeFontPadding: false },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  direction: { color: mapUi.secondaryText, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  number: { fontSize: 19, lineHeight: 24, fontWeight: '700', color: mapUi.text },
  arrivalRow: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 8 },
  times: { flex: 1, minWidth: 0, height: 44, flexDirection: 'row', alignItems: 'center', gap: 5 },
  arrivalTime: {
    flexShrink: 1,
    minWidth: 0,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eta: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontVariant: ['tabular-nums'],
  },
  remainingStops: {
    flexShrink: 1,
    color: mapUi.secondaryText,
    fontSize: 11,
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  red: { color: mapUi.blue, fontWeight: '500' },
  secondary: { color: mapUi.secondaryText, fontSize: 11, fontWeight: '400' },
  dot: {
    color: '#C5C7CB',
    fontSize: 14,
    lineHeight: 22,
    includeFontPadding: false,
    textAlignVertical: 'center',
    marginHorizontal: 3,
  },
  actions: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
});
