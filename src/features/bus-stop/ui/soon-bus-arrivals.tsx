/** @fileoverview 곧 도착하는 노선을 가로로 넘기고 해당 노선 상세로 이동한다. */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import type { BusArrival } from '../api/get-bus-arrivals';
import { getBusRouteBadge, type BusArrivalGroup } from '../model/bus-arrival';
import { useAppTheme } from '@/shared/ui';
import { appColors } from '@/shared/ui/theme';

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
        <Text style={[styles.label, { color: colors.text }]}>곧도착</Text>
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
              style={({ pressed }) => [
                styles.touch,
                index > 0 && styles.divider,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.card}>
                <View style={styles.numberRow}>
                  {badge ? (
                    <View
                      style={[
                        styles.type,
                        { backgroundColor: badge.color, borderColor: badge.color },
                      ]}
                    >
                      <Text style={[styles.typeText, { color: '#FFFFFF' }]}>{badge.label}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.number, { color: colors.text }]}>{group.busNumber}</Text>
                </View>
                {direction ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.direction, { color: colors.secondaryText }]}
                  >
                    → {direction.replace(/\s*방면$/, '')}
                  </Text>
                ) : null}
              </View>
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
    minHeight: 44,
    paddingVertical: 5,
    overflow: 'hidden',
    backgroundColor: appColors.surface,
    boxShadow: 'inset 0px -3px 4px rgba(27, 45, 72, 0.04)',
    zIndex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appColors.separator,
  },
  heading: {
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: appColors.borderStrong,
  },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  list: { flex: 1, minWidth: 0, height: 34 },
  cards: { alignItems: 'center', paddingRight: 16 },
  touch: {
    minHeight: 34,
    width: 120,
    justifyContent: 'center',
  },
  divider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: appColors.separator },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  type: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    height: 15,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeText: { fontSize: 9, lineHeight: 12, fontWeight: '500' },
  card: { justifyContent: 'center', gap: 1, paddingHorizontal: 10 },
  number: { fontSize: 13, lineHeight: 17, fontWeight: '600' },
  direction: { fontSize: 10, lineHeight: 13 },
  pressed: { opacity: 0.6 },
});
