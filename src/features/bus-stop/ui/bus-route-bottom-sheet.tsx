/** @fileoverview 노선 경유 목록과 차량 위치를 표시하고 시트 높이에 맞춰 선택 정류장의 스크롤을 조정한다. */

import { useAppTheme } from '@/shared/ui';
import { memo, useMemo, useRef } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';
import { MapBottomSheet } from '@/shared/ui/map-bottom-sheet';
import type { BusRouteDetail } from '../api/get-bus-route-detail';

import { formatEta } from '../model/bus-arrival';
import { type RouteSheetSnap } from '../model/bus-route-presentation';
import { groupRouteVehiclesByStop, selectRouteArrivals } from '../model/bus-route-sheet-data';
import { useBusArrivals } from '../model/use-bus-arrivals';
import { RouteStopRow } from './route-stop-row';
import { useBusRouteDetail } from '../model/use-bus-route-detail';

/** 응답 전에도 같은 빈 배열 참조를 사용해 파생 계산을 불필요하게 반복하지 않는다. */
const EMPTY_ARRIVALS: import('../api/get-bus-arrivals').BusArrival[] = [];

type Props = {
  stationId: string;
  routeId: string;
  stationSeq: number;
  snap: RouteSheetSnap;
  onChangeSnap: (snap: RouteSheetSnap) => void;
  onClose: () => void;
  onHeightChange: (height: number) => void;
};

/**
 * 선택 노선의 경유 순서·회차점·차량의 마지막 확인 위치를 세 단계 시트에 표시한다.
 * memo는 지도 화면이 다시 렌더링돼도 같은 props의 시트 렌더링을 생략한다.
 * @param props 정류장·노선·경유 순번과 시트 상태 변경 콜백.
 * @returns 노선 경유 목록과 도착 차량을 표시하는 바텀 시트.
 */
export const BusRouteBottomSheet = memo(function BusRouteBottomSheet({
  stationId,
  routeId,
  stationSeq,
  snap,
  onChangeSnap,
  onClose,
  onHeightChange,
}: Props) {
  /** 현재 테마 팔레트이며 테마 전환 시 텍스트·표면·강조 색상에 반영한다. */
  const { colors } = useAppTheme();

  /** 현재 테마의 스타일 계산 결과이며 팔레트가 바뀔 때만 다시 만든다. */
  const styles = useMemo(() => createStyles(colors), [colors]);

  /** 목록 인스턴스를 보관해 명령형 스크롤을 호출한다. ref 변경 자체는 렌더링을 예약하지 않는다. */
  const listRef = useRef<BottomSheetFlatListMethods>(null);

  /** 선택 노선의 상세 응답과 최초 로딩·실패 상태, 수동 재조회 함수를 읽는다. */
  const {
    data,
    isPending,
    isError,
    refetch: refetchRoute,
  } = useBusRouteDetail(stationId, routeId, stationSeq);

  /** 선택 정류장의 도착 응답과 수동 재조회 함수를 읽는다. 응답은 Query가 소유한다. */
  const { data: arrivals = EMPTY_ARRIVALS, refetch: refetchArrivals } = useBusArrivals(stationId);

  /** 이미 중앙 정렬한 시트 단계를 기록한다. 화면에 표시할 값이 아니므로 ref로 유지한다. */
  const centeredSnap = useRef<RouteSheetSnap | null>(null);

  /**
   * 높이 단계마다 선택 정류장을 한 번 중앙에 맞춘다.
   * 반복 실행 방지는 ref가 담당하므로 함수 참조를 캐시하는 useCallback은 필요하지 않다.
   */
  function centerSelectedStop() {
    if (snap === 'compact') {
      centeredSnap.current = null;
      return;
    }
    if (centeredSnap.current === snap) return;

    /** 현재 선택한 정류장 ID와 경유 순번에 대응하는 목록 행 인덱스다. */
    const index =
      data?.stops.findIndex(
        (stop) =>
          stop.stationSeq === data.selectedStationSeq && stop.stationId === data.selectedStationId,
      ) ?? -1;
    if (index >= 0) {
      centeredSnap.current = snap;
      listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
    }
  }

  /** 선택 노선과 경유 순번의 도착 차량 두 대이며 응답·선택 조건이 바뀔 때 다시 계산한다. */
  const arriving = useMemo(
    () => selectRouteArrivals(arrivals, routeId, data?.selectedStationSeq ?? stationSeq),
    [arrivals, routeId, stationSeq, data?.selectedStationSeq],
  );

  /** 차량 응답이 바뀔 때만 재계산하는 경유 순번별 차량 색인이다. */
  const vehiclesByStop = useMemo(
    () => groupRouteVehiclesByStop(data?.vehicles ?? []),
    [data?.vehicles],
  );

  /** 현재 Query와 테마 상태를 직접 반영하는 시트 헤더 요소다. 짧은 JSX에는 별도 캐시를 두지 않는다. */
  const header = (
    <View style={{ backgroundColor: colors.surface }}>
      <View style={styles.header}>
        <View style={styles.routeTitle}>
          <Text style={styles.routeBadge}>
            {data?.routeType.includes('마을') ? '마을' : '일반'}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>
            {data?.busNumber ?? '노선'}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="정류장 버스 목록으로 돌아가기"
        >
          <View style={styles.close}>
            <SymbolView
              name={{ ios: 'chevron.left', android: 'arrow_back' }}
              size={20}
              tintColor={colors.accent}
            />
          </View>
        </Pressable>
      </View>
      {snap !== 'compact' && data?.geometry.source === 'unavailable' ? (
        <Text style={styles.notice}>공식 도로 경로 정보가 없습니다.</Text>
      ) : null}
    </View>
  );

  /** 현재 로딩·오류·빈 응답 또는 축소 상태를 안내하는 목록 대체 요소다. */
  const empty =
    snap === 'compact' ? (
      <Text style={styles.compactHint}>
        선택 정류장 ·{' '}
        {arriving[0]
          ? formatEta(
              arriving[0].etaSeconds,
              arriving[0].serviceStatus,
              arriving[0].etaPrecision,
              arriving[0].etaSource,
            )
          : '도착정보 확인 중'}
      </Text>
    ) : isPending ? (
      <ActivityIndicator color={colors.accent} />
    ) : isError ? (
      <Pressable onPress={() => void refetchRoute()}>
        <Text style={styles.notice}>노선 정보를 불러오지 못했습니다. 다시 시도</Text>
      </Pressable>
    ) : null;
  return (
    <MapBottomSheet snap={snap} onChangeSnap={onChangeSnap} onHeightChange={onHeightChange}>
      <BottomSheetFlatList<BusRouteDetail['stops'][number]>
        ref={listRef}
        data={snap === 'compact' ? [] : (data?.stops ?? [])}
        keyExtractor={(stop) => `${stop.stationId}:${stop.stationSeq}`}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          snap !== 'compact' && data ? (
            <View style={styles.footer}>
              <Text style={styles.footerHint}>차량 정보는 정류장 순번 기준</Text>
              <Pressable
                onPress={() => {
                  void refetchRoute();
                  void refetchArrivals();
                }}
                accessibilityRole="button"
                accessibilityLabel="노선 정보 새로고침"
              >
                <Text style={styles.action}>새로고침 ↻</Text>
              </Pressable>
            </View>
          ) : null
        }
        onLayout={centerSelectedStop}
        onContentSizeChange={centerSelectedStop}
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
          centeredSnap.current = null;
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item: stop, index }) =>
          data ? (
            <RouteStopRow
              stop={stop}
              selected={
                stop.stationSeq === data.selectedStationSeq &&
                stop.stationId === data.selectedStationId
              }
              first={index === 0}
              last={index === data.stops.length - 1}
              turnStationSeq={data.turnStationSeq}
              vehicleCount={vehiclesByStop.get(stop.stationSeq)?.length ?? 0}
              arriving={arriving}
            />
          ) : null
        }
      />
    </MapBottomSheet>
  );
});

/** 노선 시트 헤더와 새로고침 푸터의 테마 스타일을 만든다. */
const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingBottom: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    routeTitle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    routeBadge: {
      backgroundColor: colors.accent,
      color: colors.onAccent,
      fontSize: 13,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    title: { fontSize: 23, fontWeight: '700', color: colors.text },
    action: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: '600',
      minHeight: 44,
      paddingVertical: 12,
    },
    close: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.secondarySurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactHint: {
      paddingHorizontal: 20,
      paddingTop: 8,
      fontSize: 14,
      color: colors.secondaryText,
    },
    notice: {
      minHeight: 44,
      paddingHorizontal: 20,
      paddingVertical: 12,
      color: colors.secondaryText,
    },
    listContent: { paddingBottom: 10 },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
    },
    footerHint: { fontSize: 12, color: colors.tertiaryText },
  });
