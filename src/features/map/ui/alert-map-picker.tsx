import { appShadows } from '@/shared/ui/theme';
import type { SharedValue } from 'react-native-reanimated';
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { ScrollView } from 'react-native-gesture-handler';
/** @fileoverview 알림 설정으로 전달할 실제 정류장 노선 또는 역·호선·행선지를 고르는 작은 지도 패널. */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
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
import { SubwayDestinationPicker } from '@/features/subway/ui/subway-destination-picker';
import type { SubwayAlertInput } from '@/features/subway/model/subway-alert';
import { subwayAlertOptions } from '@/features/subway/model/subway-direction';
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
  animatedPosition,
}: {
  busStop: BusStop | null;
  stationName: string | null;
  initialLineName?: string;
  stationPoint: Point | null;
  bottom: number;
  onHeightChange: (height: number) => void;
  animatedPosition: SharedValue<number>;
}) {
  const selection = useAppStore((state) => state.alertSelection);
  const [opening, setOpening] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setOpening(false);
    }, []),
  );
  const bus = useBusArrivals(busStop?.id ?? '', selection?.transport === 'bus');
  const station = useSubwayStation(stationName ?? '');
  const live = useSubwayArrivals(stationName ?? '');
  const mapStations = useSubwayMapStations();
  const [chosenLine, setChosenLine] = useState('');
  const [target, setTarget] = useState<
    Pick<SubwayAlertInput, 'direction' | 'destinations' | 'nextStationName' | 'destinationNames'>
  >({ direction: selection?.resume?.direction ?? '' });
  const [snap, setSnap] = useState<MapSheetSnap>('half');
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
  const options = subwayAlertOptions(
    line,
    live.data?.arrivals ?? [],
    timetable.data?.directions,
    target,
  );
  const point =
    mapStations.data?.find(
      (item) =>
        item.name.replace(/역$/, '') === stationName?.replace(/역$/, '') &&
        item.lineName === line?.lineName,
    ) ?? stationPoint;
  const complete = useCallback(
    (params: Record<string, string>) => {
      if (!selection || opening) return;
      setOpening(true);
      router.push({
        pathname: '/alert-setup',
        params: {
          destination: '',
          destinations: '',
          nextStationName: '',
          destinationNames: '',
          ...params,
          alertKind: selection.kind,
          alertTransport: selection.transport,
          requestId: String(Date.now()),
          alertId: '',
          returnTo: 'map-stack',
        },
      });
    },
    [selection, opening],
  );
  const chooseSubwayDirection = (next: typeof target) => {
    if (opening || !selection || !line || !stationName || (selection.kind === 'location' && !point))
      return;
    setTarget(next);
    complete({
      stationName,
      lineId: line.lineId,
      lineName: line.lineName,
      direction: next.direction,
      ...(next.nextStationName ? { nextStationName: next.nextStationName } : {}),
      ...(next.destinationNames?.length
        ? { destinationNames: JSON.stringify(next.destinationNames) }
        : {}),
      ...(point ? { latitude: String(point.latitude), longitude: String(point.longitude) } : {}),
    });
  };
  if (!selection) return null;
  const groups = groupBusArrivals(bus.data ?? []);
  const isBus = selection.transport === 'bus';
  const selected = isBus ? Boolean(busStop) : Boolean(stationName);
  const steps = isBus ? ['정류소', '버스', '알림 설정'] : ['지하철역', '호선·방면', '알림 설정'];
  return (
    <MapBottomSheet
      compactHeight={selected ? 240 : undefined}
      snap={snap}
      onChangeSnap={setSnap}
      onHeightChange={onHeightChange}
      animatedPosition={animatedPosition}
      surfaceStyle={s.surface}
      toolbar={
        <View style={s.toolbar}>
          <View style={s.steps}>
            {steps.map((step, index) => (
              <View key={step} style={s.step}>
                {index > 0 ? (
                  <SymbolView
                    name={{ ios: 'chevron.right', android: 'chevron_right' }}
                    size={9}
                    tintColor={mapUi.secondaryText}
                  />
                ) : null}
                <Text style={[s.stepText, index === (selected ? 1 : 0) && s.currentStep]}>
                  {index + 1} {step}
                </Text>
              </View>
            ))}
          </View>
          <Text style={s.title}>
            {isBus
              ? selected
                ? '알림 받고 싶은 버스를 선택해주세요'
                : '정류소를 선택해주세요'
              : selected
                ? '알림 받고 싶은 방면을 선택해주세요'
                : '지하철역을 선택해주세요'}
          </Text>
          {!selected ? (
            <Text style={s.subtitle}>
              {isBus
                ? '지도에서 정류소를 선택한 뒤, 알림 받을 버스를 골라주세요.'
                : '지도에서 역을 선택한 뒤, 알림 받을 호선과 행선지를 골라주세요.'}
            </Text>
          ) : null}
        </View>
      }
    >
      <View style={[s.panel, { paddingBottom: bottom + 12 }]}>
        {selection.transport === 'bus' ? (
          busStop ? (
            <>
              <Text style={s.subtitle}>선택한 정류소 · {busStop.name}</Text>
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
          ) : null
        ) : stationName ? (
          <>
            <Text style={s.subtitle}>선택한 역 · {stationName.replace(/역$/, '')}역</Text>
            <ScrollView
              horizontal
              style={s.chipsScroll}
              contentContainerStyle={s.chips}
              showsHorizontalScrollIndicator={false}
            >
              {lines.map((item) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: line?.lineId === item.lineId }}
                  key={item.lineId}
                  disabled={opening}
                  style={({ pressed }) => [
                    s.chip,
                    line?.lineId === item.lineId && s.active,
                    pressed && s.pressed,
                  ]}
                  onPress={() => {
                    setChosenLine(item.lineName);
                    setTarget({ direction: '' });
                  }}
                >
                  <Text style={s.route}>{item.lineName}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <ScrollView style={s.list}>
              <SubwayDestinationPicker
                directionOnly
                options={options}
                value={target}
                onChange={chooseSubwayDirection}
                disabled={opening || (selection.kind === 'location' && !point)}
              />
              {station.isFetching || timetable.isFetching ? (
                <ActivityIndicator />
              ) : options.length <= 1 ? (
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
        ) : null}
      </View>
    </MapBottomSheet>
  );
}
const s = StyleSheet.create({
  surface: {
    borderWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    boxShadow: appShadows.floating,
  },
  toolbar: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
  panel: { flex: 1, minHeight: 0, paddingHorizontal: 20, gap: 8 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepText: { fontSize: 12, lineHeight: 18, color: mapUi.secondaryText },
  currentStep: { color: mapUi.blue, fontWeight: '600' },
  title: {
    fontSize: 23,
    lineHeight: 31,
    letterSpacing: -0.6,
    fontWeight: '600',
    color: mapUi.text,
  },
  subtitle: { fontSize: 13, lineHeight: 20, color: mapUi.secondaryText, marginBottom: 4 },
  list: { flex: 1, minHeight: 0 },
  chipsScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 64 },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E6E9',
    paddingVertical: 14,
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
    borderRadius: 12,
    backgroundColor: mapUi.background,
    borderWidth: 1,
    borderColor: mapUi.border,
  },
  active: { backgroundColor: mapUi.blueSurface, borderColor: mapUi.accentBorder },
  pressed: { backgroundColor: mapUi.blueSurface },
});
