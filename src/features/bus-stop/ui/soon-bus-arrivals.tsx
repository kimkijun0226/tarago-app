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
          return (
            <Pressable
              key={`${group.routeId}:${group.stationSeq ?? ''}`}
              hitSlop={{ top: 4, bottom: 4 }}
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
    minHeight: 36,
    paddingVertical: 0,
    overflow: 'hidden',
    backgroundColor: appColors.surface,
    boxShadow: '0px 2px 6px rgba(27, 45, 72, 0.035)',
    zIndex: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: appColors.separator,
  },
  heading: {
    justifyContent: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: appColors.borderStrong,
  },
  label: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  list: { flex: 1, minWidth: 0, height: 36 },
  cards: { alignItems: 'center', paddingRight: 16 },
  touch: {
    minHeight: 36,
    justifyContent: 'center',
  },
  divider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: appColors.separator },
  numberRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  type: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    height: 14,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeText: { fontSize: 9, lineHeight: 12, fontWeight: '500' },
  card: { justifyContent: 'center', gap: 1, paddingHorizontal: 8 },
  number: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});
