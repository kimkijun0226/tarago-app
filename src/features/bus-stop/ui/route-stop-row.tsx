/** @fileoverview 노선 경유 정류장 한 행의 왕복 레일·선택 도착 시간·차량 위치를 표시한다. */

import { memo, useMemo } from 'react';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { useAppTheme } from '@/shared/ui';
import type { BusRouteDetail } from '../api/get-bus-route-detail';
import type { BusArrival } from '../api/get-bus-arrivals';
import { formatEta, formatRemainingStops } from '../model/bus-arrival';

type Props = {
  stop: BusRouteDetail['stops'][number];
  selected: boolean;
  first: boolean;
  last: boolean;
  turnStationSeq: number | null;
  vehicleCount: number;
  arriving: BusArrival[];
};

/**
 * Query와 스크롤을 소유하지 않고 경유 정류장의 표시 상태만 렌더링한다.
 * memo는 같은 정류장·차량 수·도착 배열을 받으면 시트의 레이아웃 갱신에서 행을 재사용한다.
 * @param props 경유 정류장, 선택·양 끝 여부, 회차 순번, 차량 수와 선택 노선 ETA.
 * @returns 정류장 이름과 레일·회차·차량 표시를 포함한 목록 행.
 */
export const RouteStopRow = memo(function RouteStopRow({
  stop,
  selected,
  first,
  last,
  turnStationSeq,
  vehicleCount,
  arriving,
}: Props) {
  /** 현재 테마 팔레트이며 테마 전환 시 텍스트·표면·강조 색상에 반영한다. */
  const { colors } = useAppTheme();

  /** 현재 테마의 스타일 계산 결과이며 팔레트가 바뀔 때만 다시 만든다. */
  const styles = useMemo(() => createStyles(colors), [colors]);

  /** 회차 순번 전후를 구분하는 레일 색상이다. 단순 비교이므로 별도 메모를 두지 않는다. */
  const color = stop.stationSeq <= (turnStationSeq ?? Infinity) ? '#E8AF25' : '#13B976';
  return (
    <View
      key={`${stop.stationId}:${stop.stationSeq}`}
      style={[styles.row, selected && styles.selectedRow]}
    >
      <View style={styles.rail}>
        <View
          style={[
            styles.railLine,
            { backgroundColor: color },
            first && styles.railStart,
            last && styles.railEnd,
          ]}
        />
        <View style={[styles.railDot, selected && styles.selectedDot]} />
        {vehicleCount ? (
          <View style={styles.busOnRail}>
            <SymbolView
              name={{
                ios: 'bus.fill',
                android: 'directions_bus',
              }}
              size={20}
              tintColor={colors.onAccent}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitle}>
          <Text style={[styles.stopName, selected && styles.selectedName]}>{stop.name}</Text>
          {stop.stationSeq === turnStationSeq ? <Text style={styles.turnBadge}>회차 ↪</Text> : null}
        </View>
        {selected ? (
          <>
            <Text style={styles.selectedLabel}>선택한 정류장</Text>
            {arriving.map((arrival, arrivalIndex) => (
              <Text key={arrival.vehicleId ?? arrivalIndex} style={styles.arrivalText}>
                {formatEta(
                  arrival.etaSeconds,
                  arrival.serviceStatus,
                  arrival.etaPrecision,
                  arrival.etaSource,
                )}
                {arrival.remainingStops !== null
                  ? ` · ${formatRemainingStops(arrival.remainingStops)}`
                  : ''}
              </Text>
            ))}
          </>
        ) : null}
        {vehicleCount ? (
          <Text style={styles.vehicleText}>{vehicleCount}대 마지막 위치 확인</Text>
        ) : null}
      </View>
    </View>
  );
});

/** 경유 행의 레일과 선택·차량 상태에 필요한 테마 스타일을 만든다. */
const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      minHeight: 67,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    selectedRow: { backgroundColor: colors.accentSurface },
    rail: { width: 72, alignItems: 'center', justifyContent: 'center' },
    railLine: { position: 'absolute', width: 5, top: 0, bottom: 0, left: 35 },
    railStart: { top: '50%' },
    railEnd: { bottom: '50%' },
    railDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.tertiaryText,
      zIndex: 1,
    },
    selectedDot: {
      width: 15,
      height: 15,
      borderRadius: 8,
      borderColor: colors.accent,
      borderWidth: 3,
    },
    busOnRail: {
      position: 'absolute',
      left: 22,
      top: 6,
      width: 28,
      height: 28,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
      zIndex: 2,
    },
    rowBody: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: 16,
      paddingRight: 16,
    },
    rowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    stopName: { flexShrink: 1, fontSize: 17, color: colors.text },
    selectedName: { fontWeight: '700' },
    turnBadge: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.separator,
      paddingHorizontal: 5,
      paddingVertical: 1,
      color: colors.secondaryText,
      fontSize: 11,
    },
    selectedLabel: { marginTop: 4, color: colors.accent, fontSize: 12 },
    arrivalText: { marginTop: 4, color: colors.danger, fontSize: 14 },
    vehicleText: { marginTop: 4, color: colors.success, fontSize: 12 },
  });
