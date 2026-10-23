/** @fileoverview 노선 경유 목록과 차량 위치를 표시하고 시트 높이에 맞춰 선택 정류장의 스크롤을 조정한다. */
import type { SharedValue } from 'react-native-reanimated';

import { isAxiosError } from 'axios';
import type { BusArrival } from '../api/get-bus-arrivals';
import { SheetToolbar, useAppTheme } from '@/shared/ui';
import { memo, useMemo, useRef, useEffect, useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';
import { MapBottomSheet } from '@/shared/ui/map-bottom-sheet';
import type { BusRouteDetail } from '../api/get-bus-route-detail';

import { formatEta, getBusRouteBadge } from '../model/bus-arrival';
import { isBoardingRouteStop, type RouteSheetSnap } from '../model/bus-route-presentation';
import { groupRouteVehiclesByStop, selectRouteArrivals } from '../model/bus-route-sheet-data';
import { useBusArrivals } from '../model/use-bus-arrivals';
import {
  RouteStopRow,
  ROUTE_STOP_ROW_HEIGHT,
  SELECTED_ROUTE_STOP_ROW_HEIGHT,
} from './route-stop-row';
import { useBusRouteDetail } from '../model/use-bus-route-detail';

/** 응답 전에도 같은 빈 배열 참조를 사용해 파생 계산을 불필요하게 반복하지 않는다. */
const EMPTY_ARRIVALS: import('../api/get-bus-arrivals').BusArrival[] = [];

type Props = {
  stationId: string;
  routeId: string;
  stationSeq: number;
  source?: BusArrival['routeSource'];
  snap: RouteSheetSnap;
  onChangeSnap: (snap: RouteSheetSnap) => void;
  onClose: () => void;
  onSelectStop: (stop: BusRouteDetail['stops'][number]) => void;
  onHeightChange: (height: number) => void;
  animatedPosition?: SharedValue<number>;
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
  source,
  snap,
  onChangeSnap,
  onClose,
  onSelectStop,
  onHeightChange,
  animatedPosition,
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
    error,
    isFetching: fetchingRoute,
    refetch: refetchRoute,
  } = useBusRouteDetail(stationId, routeId, stationSeq, true, source);

  /** 선택 정류장의 도착 응답과 수동 재조회 함수를 읽는다. 응답은 Query가 소유한다. */
  const { data: arrivals = EMPTY_ARRIVALS, refetch: refetchArrivals } = useBusArrivals(stationId);

  /** 통과 지점은 경로 계산에만 남기고 승하차할 수 있는 정류장 목록에서는 제외한다. */
  const visibleStops = useMemo(() => data?.stops.filter(isBoardingRouteStop) ?? [], [data?.stops]);

  /** 선택 행 전후의 높이를 알아야 먼 정류장도 중간 행 측정 없이 바로 표시할 수 있다. */
  const selectedIndex =
    visibleStops.findIndex(
      (stop) =>
        stop.stationSeq === data?.selectedStationSeq && stop.stationId === data?.selectedStationId,
    ) ?? -1;
  const viewportHeight = useRef(0);
  const centeredKey = useRef('');
  const centerFrame = useRef<number | null>(null);
  const positionKey = `${stationId}:${routeId}:${selectedIndex}`;
  function itemLayout(_: unknown, index: number) {
    return {
      index,
      length: index === selectedIndex ? SELECTED_ROUTE_STOP_ROW_HEIGHT : ROUTE_STOP_ROW_HEIGHT,
      offset:
        index * ROUTE_STOP_ROW_HEIGHT +
        (selectedIndex >= 0 && index > selectedIndex
          ? SELECTED_ROUTE_STOP_ROW_HEIGHT - ROUTE_STOP_ROW_HEIGHT
          : 0),
    };
  }

  /** 노선을 열고 목록이 준비됐을 때 한 번만 맞추며 시트 높이 변경은 스크롤을 유지한다. */
  const centerSelectedStop = useCallback(() => {
    const key = positionKey;
    if (selectedIndex < 0 || viewportHeight.current <= 1 || centeredKey.current === key) return;
    if (centerFrame.current !== null) cancelAnimationFrame(centerFrame.current);
    centerFrame.current = requestAnimationFrame(() => {
      if (!listRef.current) return;
      listRef.current.scrollToIndex({ index: selectedIndex, viewPosition: 0.5, animated: false });
      centeredKey.current = key;
    });
  }, [selectedIndex, positionKey]);

  const handleSettled = useCallback(
    (height: number) => {
      viewportHeight.current = height;
      centerSelectedStop();
    },
    [centerSelectedStop],
  );

  useEffect(() => {
    centerSelectedStop();
  }, [centerSelectedStop]);
  useEffect(
    () => () => {
      if (centerFrame.current !== null) cancelAnimationFrame(centerFrame.current);
    },
    [],
  );

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

  /** 목록과 같은 기준으로 표시하는 노선 유형 배지다. */
  const selectedArrival = arrivals.find((arrival) => arrival.routeId === routeId);
  const badge = getBusRouteBadge(data?.routeType ?? selectedArrival?.routeType ?? '');

  /** 현재 Query와 테마 상태를 직접 반영하는 시트 헤더 요소다. 짧은 JSX에는 별도 캐시를 두지 않는다. */
  const header = (
    <View style={{ backgroundColor: colors.surface }}>
      <View>
        <View style={styles.header}>
          <View style={styles.routeTitle}>
            {badge ? (
              <Text style={[styles.routeBadge, { backgroundColor: badge.color }]}>
                {badge.label}
              </Text>
            ) : null}
            <Text accessibilityRole="header" style={styles.title}>
              {data?.busNumber ?? selectedArrival?.busNumber ?? '노선'}
            </Text>
          </View>
        </View>
      </View>
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
        <Text style={styles.notice}>
          {isAxiosError(error) && error.response?.data?.code === 'SEOUL_ROUTE_UNAUTHORIZED'
            ? '서울 노선 정보 이용 승인이 필요합니다. 서버 인증키 설정을 확인해주세요.'
            : '노선 정보를 불러오지 못했습니다. 다시 시도'}
        </Text>
      </Pressable>
    ) : null;
  return (
    <MapBottomSheet
      snap={snap}
      onSettled={handleSettled}
      onChangeSnap={onChangeSnap}
      onHeightChange={onHeightChange}
      animatedPosition={animatedPosition}
      toolbar={<SheetToolbar header={header} onClose={onClose} closeLabel="노선 정보 닫기" />}
    >
      <View style={styles.content}>
        <BottomSheetFlatList<BusRouteDetail['stops'][number]>
          key={positionKey}
          ref={listRef}
          getItemLayout={itemLayout}
          extraData={selectedIndex}
          data={visibleStops}
          keyExtractor={(stop) => `${stop.stationId}:${stop.stationSeq}`}
          ListEmptyComponent={empty}
          ListFooterComponent={
            data ? (
              <View>
                {!fetchingRoute && data.geometry.source === 'unavailable' ? (
                  <Text style={styles.notice}>공식 도로 경로 정보가 없습니다.</Text>
                ) : null}
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
              </View>
            ) : null
          }
          onContentSizeChange={centerSelectedStop}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: stop, index }) =>
            data ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${stop.name} 정류소 버스 보기`}
                onPress={() => onSelectStop(stop)}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <RouteStopRow
                  stop={stop}
                  selected={
                    stop.stationSeq === data.selectedStationSeq &&
                    stop.stationId === data.selectedStationId
                  }
                  first={index === 0}
                  last={index === visibleStops.length - 1}
                  turnStationSeq={data.turnStationSeq}
                  vehicleCount={vehiclesByStop.get(stop.stationSeq)?.length ?? 0}
                  arriving={arriving}
                />
              </Pressable>
            ) : null
          }
        />
      </View>
    </MapBottomSheet>
  );
});

/** 노선 시트 헤더와 새로고침 푸터의 테마 스타일을 만든다. */
const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    content: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    routeTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
    routeBadge: {
      color: colors.onAccent,
      fontSize: 13,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    title: { fontSize: 23, fontWeight: '700', color: colors.text },
    action: {
      color: colors.accent,
      fontSize: 15,
      fontWeight: '600',
      minHeight: 44,
      paddingVertical: 12,
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
    footer: {
      margin: 16,
      borderRadius: 20,
      backgroundColor: colors.background,
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
