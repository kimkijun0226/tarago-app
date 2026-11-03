import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { SetupHeader } from '@/shared/ui/setup-header';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { appColors as c } from '@/shared/ui/theme';
import { useRecoveryStore } from '@/shared/model/recovery-store';
import { useSubwayStation, useSubwayTimetable } from '@/features/subway/model/use-subway-station';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import { subwayAlertOptions } from '@/features/subway/model/subway-direction';
import { SubwayDestinationPicker } from '@/features/subway/ui/subway-destination-picker';
import { useWidgetSelection } from '../model/widget-selection';

type Direction = Parameters<typeof SubwayDestinationPicker>[0]['value'];

/** 지도에서 고른 호선의 방면과 행선지를 선택한 뒤 위젯만 저장한다. 뒤로가기는 지도 선택을 유지한다. */
export function WidgetDirectionScreen() {
  const params = useLocalSearchParams<{
    stationName?: string;
    lineId?: string;
    lineName?: string;
  }>();
  const stationName = typeof params.stationName === 'string' ? params.stationName : '';
  const lineId = typeof params.lineId === 'string' ? params.lineId : '';
  const station = useSubwayStation(stationName);
  const line = station.data?.lines.find((item) => item.lineId === lineId);
  const live = useSubwayArrivals(stationName);
  const [openedAt] = useState(Date.now);
  const day = new Date(openedAt + 6 * 3600_000).getUTCDay();
  const timetable = useSubwayTimetable(
    stationName,
    lineId,
    day === 6 ? 'saturday' : day === 0 ? 'holiday' : 'weekday',
  );
  const options = subwayAlertOptions(line, live.data?.arrivals ?? [], timetable.data?.directions);
  const [direction, setDirection] = useState<Direction>({ direction: '' });
  const { busy, hydrated } = useWidgetSelection();
  const operation = useRef(false);
  const choose = async () => {
    const next = direction;
    if (!line || !next.direction || next.destinations?.length === 0 || operation.current || busy || !hydrated) return;
    operation.current = true;
    try {
      const saved = await useWidgetSelection.getState().add({
        id: `subway:${stationName}:${line.lineId}:${next.direction}${next.destinations ? `:${encodeURIComponent(JSON.stringify([...next.destinations].sort()))}` : ''}`,
        transport: 'subway',
        title: line.lineName,
        stationName,
        lineId: line.lineId,
        direction: next.direction,
        destination: next.destination,
        destinations: next.destinations,
        directionLabel: next.nextStationName
          ? `${next.nextStationName.replace(/역$/, '')}역 방면`
          : `${next.direction} 방면`,
      });
      if (!saved) {
        useRecoveryStore.getState().show({
          source: 'widget-save',
          message:
            useWidgetSelection.getState().storageError ?? '위젯은 최대 6개까지 추가할 수 있어요.',
        });
        return;
      }
      useRecoveryStore.getState().clear('widget-save');
      useWidgetSelection.getState().finishMapSelection();
      router.dismissTo('/widgets');
    } finally {
      operation.current = false;
    }
  };
  return (
    <SafeAreaView style={s.page}>
      <View style={s.header}>
        <SetupHeader
          current={2}
          labels={['교통수단', '지도 선택', '방면·행선지']}
          headerTitle={'위젯 추가'}
          title={direction.direction ? "어디행 열차를 볼까요?" : "어느 방면을 추가할까요?"}
          onBack={() => router.back()}
          disabled={busy}
        />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.station}>
          <TransportIcon transport="subway" size={24} tintColor={c.accent} />
          <Text style={s.name}>{stationName.replace(/역$/, '')}역</Text>
          <Text style={s.line}>{line?.lineName ?? params.lineName}</Text>
        </View>
        {station.isPending || (options.length <= 1 && (live.isPending || timetable.isPending)) ? (
          <ActivityIndicator color={c.accent} />
        ) : null}
        {line && (
          <SubwayDestinationPicker
            options={options}
            value={direction}
            onChange={setDirection}
            disabled={busy || !hydrated}
          />
        )}
        {(station.isError || (options.length <= 1 && live.isError && timetable.isError)) && (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void station.refetch();
              void live.refetch();
              void timetable.refetch();
            }}
          >
            <Text style={s.retry}>방면 다시 조회</Text>
          </Pressable>
        )}
        {!station.isPending && !station.isError && !line && (
          <Text style={s.status}>호선을 다시 선택해주세요.</Text>
        )}
      </ScrollView>
      <View style={s.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="선택한 행선지 위젯 추가"
          disabled={!line || !direction.direction || direction.destinations?.length === 0 || busy || !hydrated}
          onPress={() => void choose()}
          style={[s.add, (!line || !direction.direction || direction.destinations?.length === 0 || busy || !hydrated) && s.inactive]}
        >
          <Text style={s.addText}>{busy ? '추가 중' : '위젯 추가'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 16, paddingTop: 4 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 16 },
  footer: { paddingHorizontal: 16, paddingVertical: 10 },
  add: { backgroundColor: c.accent, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  inactive: { opacity: 0.4 },
  addText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  station: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  name: { fontSize: 17, fontWeight: '600', color: c.text },
  line: { fontSize: 14, color: c.accent },
  retry: { fontSize: 14, color: c.accent, paddingVertical: 12 },
  status: { fontSize: 14, color: c.secondaryText },
});
