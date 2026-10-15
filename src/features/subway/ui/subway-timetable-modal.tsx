/** @fileoverview 선택 역·노선·요일의 전체 시간표 또는 첫차·막차를 가상 목록으로 표시한다. */

import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { SubwayDayType } from '@/features/subway/api/get-subway-station';
import { useSubwayTimetable } from '@/features/subway/model/use-subway-station';
import { mapUi } from '@/shared/ui/map-design-tokens';

/**
 * 같은 공식 시간표에서 전체 열차 또는 첫차·막차를 표시한다.
 * @param props 역·노선·요일·표시 모드와 닫기/요일 변경 콜백.
 * @returns FlatList로 가상화한 시간표 모달. 방면 선택은 작은 배열 조회이므로 useMemo를 두지 않는다.
 */
export function SubwayTimetableModal({
  stationName,
  lineId,
  lineName,
  dayType,
  mode,
  onClose,
  onDayChange,
}: {
  stationName: string;
  lineId: string;
  lineName: string;
  dayType: SubwayDayType;
  mode: 'live' | 'timetable' | 'firstLast';
  onClose: () => void;
  onDayChange: (day: SubwayDayType) => void;
}) {
  /** 모달이 열렸을 때 선택 역·노선·요일로 실행하는 공식 시간표 Query다. */
  const query = useSubwayTimetable(stationName, lineId, dayType, mode !== 'live');

  /** 전체 시간표에서 사용자가 선택한 방면 이름이다. */
  const [selectedDirection, setSelectedDirection] = useState('');

  /** 서버가 제공한 방면별 시간표 목록이다. 응답 전에는 빈 목록으로 처리한다. */
  const directions = query.data?.directions ?? [];

  /** 사용자 선택 방면이 없거나 유효하지 않으면 첫 방면으로 보완한 현재 시간표다. */
  const direction =
    directions.find((item) => item.direction === selectedDirection) ?? directions[0];

  /** 노선 ID 부재·요청 실패·방면 부재를 구분한 시간표 안내 문구다. */
  const failure = !lineId
    ? '이 역·노선의 공식 시간표가 제공되지 않습니다.'
    : query.isError
      ? '공식 시간표를 불러오지 못했습니다. 다시 조회해주세요.'
      : query.data && !directions.length
        ? '이 역·노선의 공식 시간표가 제공되지 않습니다.'
        : '';
  return (
    <Modal visible={mode !== 'live'} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={s.screen}>
          <View style={s.header}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="시간표 닫기"
              style={s.close}
            >
              <Text style={s.back}>‹</Text>
            </Pressable>
            <Text style={s.title}>
              {stationName}역 {lineName}
            </Text>
          </View>
          <Text style={s.subtitle}>{mode === 'firstLast' ? '첫차·막차' : '전체 시간표'}</Text>
          <View style={s.tabs}>
            {(
              [
                ['weekday', '평일'],
                ['saturday', '토요일'],
                ['holiday', '휴일'],
              ] as const
            ).map(([day, label]) => (
              <Pressable
                key={day}
                onPress={() => onDayChange(day)}
                accessibilityRole="button"
                accessibilityState={{ selected: dayType === day }}
                style={[s.tab, dayType === day && s.selected]}
              >
                <Text style={[s.tabText, dayType === day && s.selectedText]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          {query.isPending && lineId && mode !== 'live' ? (
            <ActivityIndicator color={mapUi.blue} />
          ) : null}
          {failure ? (
            <View style={s.message}>
              <Text style={s.secondary}>{failure}</Text>
              {lineId ? (
                <Pressable
                  onPress={() => void query.refetch()}
                  accessibilityRole="button"
                  style={s.close}
                >
                  <Text style={s.link}>다시 조회</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {mode === 'firstLast' ? (
            <FlatList
              data={directions}
              keyExtractor={(item) => item.direction}
              renderItem={({ item }) => (
                <View style={s.summary}>
                  <Text style={s.direction}>{item.direction}</Text>
                  {(
                    [
                      ['첫차', item.firstTrain],
                      ['막차', item.lastTrain],
                    ] as const
                  ).map(([label, train]) => (
                    <View key={label} style={s.row}>
                      <Text style={s.secondary}>{label}</Text>
                      <Text style={s.time}>{train?.departureTime.slice(0, 5) ?? '미제공'}</Text>
                      <Text style={s.destination}>
                        {train?.destination ? `${train.destination}행` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              ListFooterComponent={<Text style={s.attribution}>{query.data?.attribution}</Text>}
            />
          ) : (
            <>
              <View style={s.tabs}>
                {directions.map((item) => (
                  <Pressable
                    key={item.direction}
                    onPress={() => setSelectedDirection(item.direction)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: direction?.direction === item.direction }}
                    style={[s.tab, direction?.direction === item.direction && s.selected]}
                  >
                    <Text
                      style={[s.tabText, direction?.direction === item.direction && s.selectedText]}
                    >
                      {item.direction}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <FlatList
                data={direction?.trains ?? []}
                keyExtractor={(item, index) => `${item.trainId}:${item.departureTime}:${index}`}
                renderItem={({ item }) => (
                  <View style={s.row}>
                    <Text style={s.time}>{item.departureTime.slice(0, 5)}</Text>
                    <Text style={s.destination}>
                      {item.destination}행{item.isExpress ? ' · 급행' : ''}
                    </Text>
                  </View>
                )}
                ListFooterComponent={<Text style={s.attribution}>{query.data?.attribution}</Text>}
              />
            </>
          )}
          <Text style={s.note}>24시 이후 시각은 해당 영업일의 다음 날 운행입니다.</Text>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/** 이 파일의 지하철 표시 요소가 사용하는 고정 스타일을 모듈 범위에서 한 번 만든다. */
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  close: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  back: { fontSize: 36, color: mapUi.text },
  title: { fontSize: 21, fontWeight: '700', color: mapUi.text },
  subtitle: { fontSize: 18, margin: 20, fontWeight: '600' },
  tabs: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 16 },
  tab: {
    paddingHorizontal: 18,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F4F4F4',
  },
  selected: { backgroundColor: mapUi.blue },
  tabText: { fontSize: 15, color: '#777' },
  selectedText: { color: 'white' },
  summary: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  direction: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  row: {
    minHeight: 58,
    marginHorizontal: 20,
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  time: { fontSize: 20, fontWeight: '600', color: mapUi.blue },
  destination: { flex: 1, fontSize: 16, color: '#444' },
  secondary: { color: '#888', fontSize: 15 },
  attribution: { fontSize: 12, color: '#888', padding: 20 },
  note: { color: '#888', fontSize: 12, padding: 20 },
  message: { padding: 20 },
  link: { color: mapUi.blue, fontSize: 15 },
});
