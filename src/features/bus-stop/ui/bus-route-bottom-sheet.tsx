import { useAppTheme } from '@/shared/ui/design-system';
import { memo, useCallback, useMemo, useRef } from "react";
import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { BottomSheetFlatList, type BottomSheetFlatListMethods } from '@gorhom/bottom-sheet';
import { MapBottomSheet } from '@/shared/ui/map-bottom-sheet';
import type { BusRouteDetail } from '../api/get-bus-route-detail';

import { formatEta, formatRemainingStops } from "../model/bus-arrival";
import {
  type RouteSheetSnap,
} from "../model/bus-route-presentation";
import { useBusArrivals } from "../model/use-bus-arrivals";
import { useBusRouteDetail } from "../model/use-bus-route-detail";

const EMPTY_ARRIVALS: import("../api/get-bus-arrivals").BusArrival[] = [];

type Props = {
  stationId: string;
  routeId: string;
  stationSeq: number;
  snap: RouteSheetSnap;
  onChangeSnap: (snap: RouteSheetSnap) => void;
  onClose: () => void;
  onHeightChange: (height: number) => void;
};

/** 선택 노선의 경유 순서·회차점·차량의 마지막 확인 위치를 세 단계 시트에 표시한다. */
export const BusRouteBottomSheet = memo(function BusRouteBottomSheet({
  stationId,
  routeId,
  stationSeq,
  snap,
  onChangeSnap,
  onClose,
  onHeightChange,
}: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const listRef=useRef<BottomSheetFlatListMethods>(null);
  const {
    data,
    isPending,
    isError,
    refetch: refetchRoute,
  } = useBusRouteDetail(stationId, routeId, stationSeq);
  const { data: arrivals = EMPTY_ARRIVALS, refetch: refetchArrivals } =
    useBusArrivals(stationId);
  const centeredSnap=useRef<RouteSheetSnap|null>(null);
  const centerSelectedStop=useCallback(()=>{
    if(snap==='compact'){centeredSnap.current=null;return;}
    if(centeredSnap.current===snap)return;
    const index=data?.stops.findIndex(stop=>stop.stationSeq===data.selectedStationSeq && stop.stationId===data.selectedStationId) ?? -1;
    if(index>=0) {centeredSnap.current=snap;listRef.current?.scrollToIndex({index,viewPosition:.5,animated:false});}
  },[snap,data]);
  const arriving = useMemo(() => arrivals
    .filter(
      (item) =>
        item.routeId === routeId &&
        (item.stationSeq === undefined || item.stationSeq === (data?.selectedStationSeq ?? stationSeq)) &&
        item.etaSeconds !== null,
    )
    .sort((a, b) => a.etaSeconds! - b.etaSeconds!)
    .slice(0, 2), [arrivals, routeId, stationSeq,data?.selectedStationSeq]);
  const vehiclesByStop = useMemo(() => {
    const grouped = new Map<number, NonNullable<typeof data>["vehicles"]>();
    for (const vehicle of data?.vehicles ?? []) {
      const vehicles = grouped.get(vehicle.stationSeq) ?? [];
      vehicles.push(vehicle);
      grouped.set(vehicle.stationSeq, vehicles);
    }
    return grouped;
  }, [data?.vehicles]);
  const header=<View style={{backgroundColor:colors.surface}}>
      <View style={styles.header}>
        <View style={styles.routeTitle}>
          <Text style={styles.routeBadge}>
            {data?.routeType.includes("마을") ? "마을" : "일반"}
          </Text>
          <Text accessibilityRole="header" style={styles.title}>{data?.busNumber ?? "노선"}</Text>
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="정류장 버스 목록으로 돌아가기"
        >
          <View style={styles.close}><SymbolView name={{ios:'chevron.left',android:'arrow_back',web:'arrow_back'}} size={20} tintColor={colors.accent} /></View>
        </Pressable>
      </View>
    {snap!=='compact' && data?.geometry.source==='unavailable' ? <Text style={styles.notice}>공식 도로 경로 정보가 없습니다.</Text> : null}
  </View>;
  const empty=snap==='compact' ? <Text style={styles.compactHint}>선택 정류장 · {arriving[0] ? formatEta(arriving[0].etaSeconds,arriving[0].serviceStatus,arriving[0].etaPrecision,arriving[0].etaSource) : '도착정보 확인 중'}</Text>
    : isPending ? <ActivityIndicator color={colors.accent} /> : isError ? <Pressable onPress={()=>void refetchRoute()}><Text style={styles.notice}>노선 정보를 불러오지 못했습니다. 다시 시도</Text></Pressable> : null;
  return <MapBottomSheet snap={snap} onChangeSnap={onChangeSnap} onHeightChange={onHeightChange}>
    <BottomSheetFlatList<BusRouteDetail['stops'][number]>
      ref={listRef}
      data={snap==='compact' ? [] : data?.stops ?? []}
      keyExtractor={(stop)=>`${stop.stationId}:${stop.stationSeq}`}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={snap!=='compact' && data ? (
          <View style={styles.footer}>
            <Text style={styles.footerHint}>{data.vehicles.some(v=>v.positionSource==='gps') ? '지도는 제공된 차량 좌표 · 목록은 정류장 순번 기준' : '차량 정보는 정류장 순번 기준'}</Text>
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
      ) : null}
      onLayout={centerSelectedStop}
      onContentSizeChange={centerSelectedStop}
      onScrollToIndexFailed={({index,averageItemLength})=>{
        listRef.current?.scrollToOffset({offset:index*averageItemLength,animated:false});
        centeredSnap.current=null;
      }}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
            renderItem={({item:stop,index})=>{
              if(!data)return null;
              const vehicles = vehiclesByStop.get(stop.stationSeq) ?? [];
              const selected =
                stop.stationSeq === data.selectedStationSeq &&
                stop.stationId === data.selectedStationId;
              const color =
                stop.stationSeq <= (data.turnStationSeq ?? Infinity)
                  ? "#E8AF25"
                  : "#13B976";
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
                        index === 0 && styles.railStart,
                        index === data.stops.length - 1 && styles.railEnd,
                      ]}
                    />
                    <View
                      style={[styles.railDot, selected && styles.selectedDot]}
                    />
                    {vehicles.length ? (
                      <View style={styles.busOnRail}>
                        <SymbolView
                          name={{
                            ios: "bus.fill",
                            android: "directions_bus",
                            web: "directions_bus",
                          }}
                          size={20}
                          tintColor={colors.onAccent}
                        />
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.rowBody}>
                    <View style={styles.rowTitle}>
                      <Text
                        style={[
                          styles.stopName,
                          selected && styles.selectedName,
                        ]}
                      >
                        {stop.name}
                      </Text>
                      {stop.stationSeq === data.turnStationSeq ? (
                        <Text style={styles.turnBadge}>회차 ↪</Text>
                      ) : null}
                    </View>
                    {selected ? (
                      <>
                        <Text style={styles.selectedLabel}>선택한 정류장</Text>
                        {arriving.map((arrival, arrivalIndex) => (
                          <Text
                            key={arrival.vehicleId ?? arrivalIndex}
                            style={styles.arrivalText}
                          >
                            {formatEta(
                              arrival.etaSeconds,
                              arrival.serviceStatus,
                              arrival.etaPrecision,
                              arrival.etaSource,
                            )}
                            {arrival.remainingStops !== null
                              ? ` · ${formatRemainingStops(arrival.remainingStops)}`
                              : ""}
                          </Text>
                        ))}
                      </>
                    ) : null}
                    {vehicles.length ? (
                      <Text style={styles.vehicleText}>
                        {vehicles.length}대 마지막 위치 확인
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            }}
    />
  </MapBottomSheet>;
});

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  routeTitle: { flex:1, flexDirection: "row", alignItems: "center", gap: 8 },
  routeBadge: {
    backgroundColor: colors.accent,
    color: colors.onAccent,
    fontSize: 13,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  title: { fontSize: 23, fontWeight: "700", color: colors.text },
  action: { color: colors.accent, fontSize: 15, fontWeight: "600",minHeight:44,paddingVertical:12 },
  close: { width:44,height:44,borderRadius:22,backgroundColor:colors.secondarySurface,alignItems:"center",justifyContent:"center" },
  compactHint: {
    paddingHorizontal: 20,
    paddingTop: 8,
    fontSize: 14,
    color: colors.secondaryText,
  },
  notice: { minHeight:44, paddingHorizontal: 20, paddingVertical: 12, color: colors.secondaryText },
  list: { flex: 1 },
  listContent: { paddingBottom: 10 },
  row: {
    flexDirection: "row",
    minHeight: 67,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  selectedRow: { backgroundColor: colors.accentSurface },
  rail: { width: 72, alignItems: "center", justifyContent: "center" },
  railLine: { position: "absolute", width: 5, top: 0, bottom: 0, left: 35 },
  railStart: { top: "50%" },
  railEnd: { bottom: "50%" },
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
    position: "absolute",
    left: 22,
    top: 6,
    width: 28,
    height: 28,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    zIndex: 2,
  },
  rowBody: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 16,
    paddingRight: 16,
  },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  stopName: { flexShrink:1, fontSize: 17, color: colors.text },
  selectedName: { fontWeight: "700" },
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
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  footerHint: { fontSize: 12, color: colors.tertiaryText },
});
