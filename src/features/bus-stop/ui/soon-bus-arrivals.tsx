/** @fileoverview 곧 도착하는 노선을 가로로 넘기고 해당 노선 상세로 이동한다. */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import type { BusArrival } from '../api/get-bus-arrivals';
import { getBusRouteBadge, type BusArrivalGroup } from '../model/bus-arrival';
import { useAppTheme } from '@/shared/ui';

type Props = {
  groups: BusArrivalGroup[];
  onSelectRoute: (routeId: string, stationSeq: number, source?: BusArrival['routeSource']) => void;
};

export const SoonBusArrivals = memo(function SoonBusArrivals({ groups, onSelectRoute }: Props) {
  const { colors } = useAppTheme();
  if (!groups.length) return null;
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={[styles.label, { color: colors.danger }]}>곧도착</Text>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={styles.cards}
      >
        {groups.map((group, index) => {
          const badge = getBusRouteBadge(group.routeType);
          const direction = group.first.direction || group.first.nextStopName;
          return (
            <Pressable
              key={`${group.routeId}:${group.stationSeq ?? ''}`}
              accessibilityRole="button"
              accessibilityLabel={`${group.busNumber}번 곧 도착${group.first.nextStopName ? `, 다음 ${group.first.nextStopName}` : group.first.direction ? `, ${group.first.direction}` : ''}, 노선 상세 보기`}
              onPress={() =>
                onSelectRoute(group.routeId, group.stationSeq ?? 0, group.first.routeSource)
              }
              style={({ pressed }) => [styles.touch, pressed && styles.pressed]}
            >
              <View style={styles.card}>
                <Text style={[styles.number, { color: badge?.color ?? colors.text }]}>
                  {group.busNumber}
                </Text>
                {direction ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.direction, { color: colors.secondaryText }]}
                  >
                    → {direction.replace(/\s*방면$/, '')}
                  </Text>
                ) : null}
              </View>
              {index < groups.length - 1 ? <View style={styles.itemDivider} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E4E6E9',
  },
  heading: {
    height: 30,
    justifyContent: 'center',
    paddingRight: 12,
    borderRightWidth: 1,
    borderRightColor: '#E4E6E9',
  },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '700' },
  list: { flex: 1 },
  cards: { alignItems: 'center' },
  touch: { minHeight: 48, width: 106, justifyContent: 'center' },
  itemDivider: {
    position: 'absolute',
    right: 0,
    top: 12,
    bottom: 12,
    width: 1,
    backgroundColor: '#ECEDEF',
  },
  card: { alignItems: 'flex-start', justifyContent: 'center', gap: 2, paddingHorizontal: 12 },
  number: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  direction: { fontSize: 10, lineHeight: 14, maxWidth: 82 },
  pressed: { opacity: 0.6 },
});
