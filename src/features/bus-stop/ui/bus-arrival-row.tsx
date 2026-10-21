/** @fileoverview 노선 번호 아래에 최대 두 차량의 도착정보를 나란히 표시하고 알림 진입을 제공한다. */

import type { BusArrival } from '../api/get-bus-arrivals';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { SymbolView } from 'expo-symbols';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatEta, getBusRouteBadge, type BusArrivalGroup } from '../model/bus-arrival';

type Props = {
  group: BusArrivalGroup;
  onSelectRoute: (routeId: string, stationSeq: number, source?: BusArrival['routeSource']) => void;
  onConfigureAlert: (group: BusArrivalGroup) => void;
};

/** 지도 이동에 따른 부모 갱신을 memo로 차단한다. 서버가 주지 않는 방면·혼잡도는 추정하지 않는다. */
export const BusArrivalRow = memo(function BusArrivalRow({
  group,
  onSelectRoute,
  onConfigureAlert,
}: Props) {
  /** 해당 노선 유형의 배지 이름과 색상이다. */
  const badge = getBusRouteBadge(group.routeType);

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
              <Text style={[styles.badge, { backgroundColor: badge.color }]}>{badge.label}</Text>
            ) : null}
            <Text style={styles.number}>{group.busNumber}</Text>
            {group.first.nextStopName ? (
              <Text numberOfLines={1} style={styles.direction}>
                · 다음 {group.first.nextStopName}
              </Text>
            ) : null}
          </View>
          {group.first.direction ? (
            <Text style={styles.direction}>
              {group.first.direction.replace(/\s*방면$/, '')} 방면
            </Text>
          ) : null}
          {group.first.routeStartName && group.first.routeEndName ? (
            <Text style={styles.direction}>
              {group.first.routeStartName} → {group.first.routeEndName}
            </Text>
          ) : null}
        </View>
        <View style={styles.times}>
          <ArrivalTime arrival={group.first} />
          {group.second ? (
            <>
              <Text style={styles.dot}>·</Text>
              <ArrivalTime arrival={group.second} />
            </>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${group.busNumber}번 버스 알림 설정`}
          onPress={() => onConfigureAlert(group)}
          style={styles.icon}
        >
          <SymbolView
            name={{ ios: 'bell', android: 'notifications_none' }}
            size={20}
            tintColor={mapUi.blue}
          />
        </Pressable>
      </View>
    </View>
  );
});

/** 분 단위 원본의 정밀도를 보존하면서 두 차량을 한 줄에 표시한다. 작은 문자열 변환은 캐시하지 않는다. */
function ArrivalTime({ arrival }: { arrival: BusArrivalGroup['first'] }) {
  return (
    <Text style={styles.eta}>
      <Text style={arrival.etaSeconds === null ? styles.secondary : styles.red}>
        {formatEta(
          arrival.etaSeconds,
          arrival.serviceStatus,
          arrival.etaPrecision,
          arrival.etaSource,
        )}
      </Text>
      {arrival.remainingStops !== null && arrival.remainingStops > 0 ? (
        <Text style={styles.secondary}> {arrival.remainingStops}정류장</Text>
      ) : null}
    </Text>
  );
}

/** 정적인 스타일은 모듈에서 한 번 생성하므로 useMemo가 필요 없다. */
const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  content: { flex: 1, minHeight: 64, justifyContent: 'center', gap: 8 },
  routeInfo: { gap: 4 },
  badge: {
    color: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 3,
    fontSize: 12,
    fontWeight: '500',
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  direction: { color: '#929292', fontSize: 13, flexShrink: 1 },
  number: { fontSize: 20, fontWeight: '700', color: mapUi.text },
  times: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  eta: { fontSize: 14, lineHeight: 28 },
  red: { color: '#FF4438', fontWeight: '500' },
  secondary: { color: '#929292', fontSize: 13, fontWeight: '400' },
  dot: { color: '#929292' },
  actions: { alignItems: 'center', marginLeft: 4 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
