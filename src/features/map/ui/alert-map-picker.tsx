/** @fileoverview 알림 설정으로 전달할 실제 정류장 노선 또는 역·호선·방면을 고르는 작은 지도 패널. */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { groupBusArrivals } from '@/features/bus-stop/model/bus-arrival';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import {
  useSubwayMapStations,
  useSubwayStation,
  useSubwayTimetable,
} from '@/features/subway/model/use-subway-station';
import { useAppStore } from '@/shared/model/app-store';
import {
  subwayDirectionPresentation,
  stationLabel,
  destinationLabel,
} from '@/features/subway/model/subway-direction';
import { mapUi } from '@/shared/ui/map-design-tokens';
import type { Point } from '@/features/mobility/api/mobility';

/** 서버가 확인한 대상만 알림 초안에 전달한다. 좌표가 없는 위치 알림은 선택하지 않는다. */
export function AlertMapPicker({
  busStop,
  stationName,
  initialLineName,
  stationPoint,
  bottom,
  onHeightChange,
  onComplete,
}: {
  busStop: BusStop | null;
  stationName: string | null;
  initialLineName?: string;
  stationPoint: Point | null;
  bottom: number;
  onHeightChange: (height: number) => void;
  onComplete: () => void;
}) {
  const selection = useAppStore((state) => state.alertSelection);
  const finish = useAppStore((state) => state.finishAlertSelection);
  const bus = useBusArrivals(busStop?.id ?? '', selection?.transport === 'bus');
  const station = useSubwayStation(stationName ?? '');
  const live = useSubwayArrivals(stationName ?? '');
  const mapStations = useSubwayMapStations();
  const [chosenLine, setChosenLine] = useState('');
  const [openedAt] = useState(() => Date.now());
  const lines = station.data?.lines ?? [];
  const line =
    lines.find((item) => item.lineName === chosenLine) ??
    lines.find((item) => item.lineName === initialLineName) ??
    lines[0];
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(openedAt - 3 * 3_600_000);
  const timetable = useSubwayTimetable(
    stationName ?? '',
    line?.lineId ?? '',
    weekday === 'Sat' ? 'saturday' : weekday === 'Sun' ? 'holiday' : 'weekday',
  );
  const scheduledDirections = (timetable.data?.directions ?? []).map((item) => item.direction);
  const liveDirections = [
    ...new Set(
      (live.data?.arrivals ?? [])
        .filter((item) => item.lineId === line?.lineId)
        .map((item) => item.direction),
    ),
  ];
  const directions =
    scheduledDirections.length && liveDirections.every((item) => scheduledDirections.includes(item))
      ? scheduledDirections
      : liveDirections.length
        ? liveDirections
        : scheduledDirections;
  const point =
    mapStations.data?.find(
      (item) =>
        item.name.replace(/역$/, '') === stationName?.replace(/역$/, '') &&
        item.lineName === line?.lineName,
    ) ?? stationPoint;
  const complete = useCallback(
    (params: Record<string, string>) => {
      if (!selection) return;
      onComplete();
      finish();
      router.navigate({
        pathname: '/alerts',
        params: {
          ...params,
          alertKind: selection.kind,
          alertTransport: selection.transport,
          requestId: String(Date.now()),
          alertId: '',
        },
      });
    },
    [selection, onComplete, finish],
  );
  if (!selection) return null;
  const groups = groupBusArrivals(bus.data ?? []);
  return (
    <View
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
      style={[s.panel, { paddingBottom: bottom + 18 }]}
    >
      <Text style={s.title}>
        {selection.transport === 'bus'
          ? '알림을 시작할 버스를 선택해주세요'
          : '알림을 시작할 지하철을 선택해주세요'}
      </Text>
      {selection.transport === 'bus' ? (
        busStop ? (
          <>
            <Text style={s.subtitle}>{busStop.name}</Text>
            <ScrollView style={s.list}>
              {groups.map((group) => (
                <Pressable
                  accessibilityRole="button"
                  key={`${group.routeId}:${group.stationSeq ?? ''}`}
                  style={({ pressed }) => [s.row, pressed && s.pressed]}
                  onPress={() =>
                    complete({
                      stationId: busStop.id,
                      stationName: busStop.name,
                      latitude: String(busStop.latitude),
                      longitude: String(busStop.longitude),
                      routeId: group.routeId,
                      busNumber: group.busNumber,
                      ...(group.stationSeq === undefined
                        ? {}
                        : { stationSeq: String(group.stationSeq) }),
                    })
                  }
                >
                  <Text style={s.route}>{group.busNumber}</Text>
                  <Text style={s.detail}>
                    {group.first.direction ?? group.first.nextStopName ?? group.routeType}
                  </Text>
                </Pressable>
              ))}
              {bus.isPending ? (
                <ActivityIndicator />
              ) : !groups.length ? (
                <Text style={s.message}>
                  {bus.isError ? '버스 정보를 불러오지 못했어요.' : '선택 가능한 버스가 없어요.'}
                </Text>
              ) : null}
              {bus.isError ? (
                <Pressable accessibilityRole="button" onPress={() => void bus.refetch()}>
                  <Text style={s.link}>다시 조회</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </>
        ) : (
          <Text style={s.subtitle}>지도에서 버스 정류장을 눌러주세요</Text>
        )
      ) : stationName ? (
        <>
          <Text style={s.subtitle}>
            {stationName.replace(/역$/, '')}역 · 호선과 방면을 선택해주세요
          </Text>
          <ScrollView horizontal contentContainerStyle={s.chips}>
            {lines.map((item) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: line?.lineId === item.lineId }}
                key={item.lineId}
                style={({ pressed }) => [
                  s.chip,
                  line?.lineId === item.lineId && s.active,
                  pressed && s.pressed,
                ]}
                onPress={() => setChosenLine(item.lineName)}
              >
                <Text style={s.route}>{item.lineName}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView style={s.list}>
            {directions.map((direction) => {
              const presentation = subwayDirectionPresentation(
                line,
                direction,
                live.data?.arrivals ?? [],
                timetable.data?.directions,
              );
              return (
                <Pressable
                  accessibilityRole="button"
                  key={direction}
                  disabled={selection.kind === 'location' && !point}
                  style={({ pressed }) => [s.row, pressed && s.pressed]}
                  onPress={() => {
                    if (line)
                      complete({
                        stationName,
                        lineId: line.lineId,
                        lineName: line.lineName,
                        direction,
                        nextStationName: presentation.nextStationName ?? '',
                        destinationNames: JSON.stringify(presentation.destinationNames),
                        ...(point
                          ? { latitude: String(point.latitude), longitude: String(point.longitude) }
                          : {}),
                      });
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={s.route}>
                      {presentation.nextStationName
                        ? `${stationLabel(presentation.nextStationName)} 방면`
                        : '다음 역 확인 중'}
                    </Text>
                    <Text style={s.detail}>
                      {presentation.destinationNames
                        .slice(0, 2)
                        .map(destinationLabel)
                        .join(' · ') || '행선지 미제공'}
                    </Text>
                  </View>
                  <SymbolView
                    name={{ ios: 'chevron.right', android: 'chevron_right' }}
                    size={20}
                    tintColor={mapUi.blue}
                  />
                </Pressable>
              );
            })}
            {station.isFetching || timetable.isFetching ? (
              <ActivityIndicator />
            ) : !directions.length ? (
              <Text style={s.message}>선택 가능한 방면 정보가 없어요.</Text>
            ) : null}
            {station.isError || timetable.isError || live.isError ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void station.refetch();
                  void timetable.refetch();
                  void live.refetch();
                }}
              >
                <Text style={s.link}>방면 정보 다시 조회</Text>
              </Pressable>
            ) : null}
            {selection.kind === 'location' && !point ? (
              <Text style={s.message}>역 위치를 확인한 뒤 선택할 수 있어요.</Text>
            ) : null}
          </ScrollView>
        </>
      ) : (
        <Text style={s.subtitle}>지도에서 지하철역을 눌러주세요</Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: mapUi.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    gap: 4,
    zIndex: 30,
  },
  title: { fontSize: 19, fontWeight: '700', color: mapUi.text },
  subtitle: { fontSize: 14, color: mapUi.secondaryText, marginBottom: 8 },
  list: { maxHeight: 225 },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderWidth: 1,
    borderColor: mapUi.border,
    borderBottomWidth: 3,
    borderRadius: 20,
    padding: 14,
    marginBottom: 8,
    backgroundColor: mapUi.background,
  },
  route: { fontSize: 16, fontWeight: '600', color: mapUi.text },
  detail: { fontSize: 13, color: mapUi.secondaryText, flexShrink: 1 },
  message: { color: mapUi.secondaryText, paddingVertical: 16 },
  link: { color: mapUi.blue, paddingVertical: 12, minHeight: 44 },
  chips: { gap: 8, paddingVertical: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: mapUi.separator,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: mapUi.border,
  },
  active: { backgroundColor: mapUi.blueSurface, borderColor: mapUi.accentBorder },
  pressed: { backgroundColor: mapUi.blueSurface, transform: [{ scale: 0.98 }, { translateY: 1 }] },
});
