/** @fileoverview 노선 번호 아래에 최대 두 차량의 도착정보를 두 줄의 간결한 행으로 표시한다. */

import type { BusArrival } from '../api/get-bus-arrivals';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatEta, getBusRouteBadge, type BusArrivalGroup } from '../model/bus-arrival';

type Props = {
  group: BusArrivalGroup;
  onSelectRoute: (routeId: string, stationSeq: number, source?: BusArrival['routeSource']) => void;
};

/** 지도 이동에 따른 부모 갱신을 memo로 차단한다. 서버가 주지 않는 방면·혼잡도는 추정하지 않는다. */
export const BusArrivalRow = memo(function BusArrivalRow({ group, onSelectRoute }: Props) {
  /** 해당 노선 유형의 배지 이름과 색상이다. */
  const badge = getBusRouteBadge(group.routeType);
  const direction = (group.first.direction || group.first.nextStopName || '').replace(
    /\s*방면$/,
    '',
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${group.busNumber}번 노선 상세 보기`}
      onPress={() => onSelectRoute(group.routeId, group.stationSeq ?? 0, group.first.routeSource)}
      style={styles.row}
    >
      <View style={styles.heading}>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badge.color, borderColor: badge.color }]}>
            <Text style={[styles.badgeText, { color: '#FFFFFF' }]}>{badge.label}</Text>
          </View>
        ) : null}
        <Text style={styles.number}>{group.busNumber}</Text>
        {direction ? (
          <Text numberOfLines={1} style={styles.direction}>
            → {direction} 방면
          </Text>
        ) : null}
      </View>
      <View style={styles.times}>
        <ArrivalTime arrival={group.first} />
        {group.second ? (
          <>
            <View style={styles.timeDivider} />
            <ArrivalTime arrival={group.second} next />
          </>
        ) : null}
      </View>
    </Pressable>
  );
});

/** 분 단위 원본의 정밀도를 보존하면서 두 차량을 한 줄에 표시한다. 작은 문자열 변환은 캐시하지 않는다. */
function ArrivalTime({
  arrival,
  next = false,
}: {
  arrival: BusArrivalGroup['first'];
  next?: boolean;
}) {
  return (
    <View style={styles.arrivalTime}>
      {next && <Text style={styles.nextLabel}>다음</Text>}
      <Text
        numberOfLines={1}
        style={[
          styles.eta,
          next && styles.nextEta,
          arrival.etaSeconds === null && styles.secondary,
        ]}
      >
        {formatEta(
          arrival.etaSeconds,
          arrival.serviceStatus,
          arrival.etaPrecision,
          arrival.etaSource,
          arrival,
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
    paddingTop: 9,
    paddingBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: mapUi.separator,
    gap: 4,
    marginHorizontal: 16,
    marginVertical: 0,
    backgroundColor: '#FFFFFF',
  },
  badge: {
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, lineHeight: 13, fontWeight: '500', includeFontPadding: false },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  direction: { color: mapUi.secondaryText, fontSize: 12, lineHeight: 17, flexShrink: 1 },
  number: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: mapUi.text },
  times: { minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  timeDivider: {
    width: StyleSheet.hairlineWidth,
    height: 12,
    alignSelf: 'center',
    backgroundColor: mapUi.border,
  },
  arrivalTime: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  eta: {
    flexShrink: 1,
    color: '#E5484D',
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    includeFontPadding: false,
    textAlignVertical: 'center',
    fontVariant: ['tabular-nums'],
  },
  remainingStops: {
    flexShrink: 1,
    color: mapUi.secondaryText,
    fontSize: 11,
    lineHeight: 16,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  nextLabel: { color: mapUi.secondaryText, fontSize: 11, lineHeight: 16 },
  nextEta: { color: mapUi.secondaryText, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  secondary: { color: mapUi.secondaryText, fontSize: 11, lineHeight: 16, fontWeight: '400' },
});
