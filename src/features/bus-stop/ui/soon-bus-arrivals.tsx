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
    <View style={[styles.container, { borderBottomColor: colors.separator }]}>
      <Text style={[styles.label, { color: colors.danger }]}>곧도착</Text>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cards}
      >
        {groups.map((group) => {
          const badge = getBusRouteBadge(group.routeType);
          return (
            <Pressable
              key={`${group.routeId}:${group.stationSeq ?? ''}`}
              accessibilityRole="button"
              accessibilityLabel={`${group.busNumber}번 곧 도착, 노선 상세 보기`}
              onPress={() =>
                onSelectRoute(group.routeId, group.stationSeq ?? 0, group.first.routeSource)
              }
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.separator },
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.heading}>
                {badge ? (
                  <Text style={[styles.badge, { backgroundColor: badge.color }]}>
                    {badge.label}
                  </Text>
                ) : null}
                <Text style={[styles.number, { color: colors.text }]}>{group.busNumber}</Text>
              </View>
              <Text numberOfLines={1} style={[styles.detail, { color: colors.secondaryText }]}>
                {group.first.nextStopName
                  ? `다음 ${group.first.nextStopName}`
                  : group.first.direction || '곧 도착'}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  label: { paddingHorizontal: 18, marginBottom: 8, fontSize: 13, fontWeight: '700' },
  cards: { paddingHorizontal: 18, gap: 8 },
  card: {
    minWidth: 140,
    maxWidth: 220,
    padding: 14,
    borderWidth: 1,
    borderRadius: 20,
    boxShadow: '0px 3px 0px #22222208',
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    color: '#FFFFFF',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
    fontSize: 11,
  },
  number: { fontSize: 20, fontWeight: '700' },
  detail: { fontSize: 12, marginTop: 4 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
