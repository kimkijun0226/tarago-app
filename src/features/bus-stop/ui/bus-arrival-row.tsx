/** @fileoverview 노선 번호 아래에 최대 두 차량의 도착정보를 나란히 표시하고 즐겨찾기·알림 진입을 제공한다. */
import { memo } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatEta, getBusRouteBadge, type BusArrivalGroup } from '../model/bus-arrival';
import { useSavedBusItem } from '../model/use-saved-bus-item';
import { mapUi } from '@/shared/ui/map-design-tokens';

type Props = {
  group: BusArrivalGroup;
  stationId: string;
  onSelectRoute: (routeId: string, stationSeq: number) => void;
  onConfigureAlert: (group: BusArrivalGroup) => void;
};

/** 지도 이동에 따른 부모 갱신을 memo로 차단한다. 서버가 주지 않는 방면·혼잡도는 추정하지 않는다. */
export const BusArrivalRow = memo(function BusArrivalRow({
  group,
  stationId,
  onSelectRoute,
  onConfigureAlert,
}: Props) {
  /** 같은 정류장의 왕복 경유를 구분하는 노선별 즐겨찾기다. */
  const favorite = useSavedBusItem(`${stationId}:${group.routeId}:${group.stationSeq ?? ''}`);

  /** 공급자 코드와 한글 유형을 함께 처리한 노선 아이콘 색상이다. */
  const color = getBusRouteBadge(group.routeType)?.color ?? '#85888B';

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${group.busNumber}번 노선 상세 보기`}
        onPress={() => onSelectRoute(group.routeId, group.stationSeq ?? 0)}
        style={styles.content}
      >
        <View style={styles.heading}>
          <SymbolView
            name={{ ios: 'bus.fill', android: 'directions_bus' }}
            size={21}
            tintColor={color}
          />
          <Text style={styles.number}>{group.busNumber}</Text>
          {group.first.nextStopName ? (
            <Text numberOfLines={1} style={styles.direction}>
              · {group.first.nextStopName} 방면
            </Text>
          ) : null}
        </View>
        {group.first.direction ? (
          <Text style={styles.direction}>{group.first.direction} 방면</Text>
        ) : null}
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
          accessibilityLabel={`${group.busNumber}번 즐겨찾기 ${favorite.saved ? '해제' : '추가'}`}
          accessibilityState={{ selected: favorite.saved, disabled: favorite.busy }}
          disabled={favorite.busy}
          onPress={() => void favorite.toggle()}
          style={styles.icon}
        >
          <SymbolView
            name={{
              ios: favorite.saved ? 'star.fill' : 'star',
              android: favorite.saved ? 'star' : 'star_border',
            }}
            size={24}
            tintColor={favorite.saved ? '#F5B800' : '#A6A6A6'}
          />
        </Pressable>
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
      {favorite.error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {favorite.error}
        </Text>
      ) : null}
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
    minHeight: 108,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  content: { flex: 1, minHeight: 64, justifyContent: 'center', gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  direction: { color: '#929292', fontSize: 15, flexShrink: 1 },
  number: { fontSize: 20, fontWeight: '700', color: mapUi.text },
  times: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  eta: { fontSize: 15, lineHeight: 23 },
  red: { color: '#FF4438' },
  secondary: { color: '#929292' },
  dot: { color: '#929292' },
  actions: { alignItems: 'center', marginLeft: 4 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  error: { width: '100%', color: '#FF4438', fontSize: 12 },
});
