/** @fileoverview 장소·정류장 검색 결과와 집·회사·최근 검색을 표시하는 선택 화면. 서버 조회와 저장은 부모가 담당한다. */
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { Place } from '../api/mobility';
import { isBusStopPlace, isSubwayPlace, matchesSearchFilter, type SearchResultFilter } from '../model/place-kind';
import { mapUi } from '@/shared/ui/map-design-tokens';

type Props = {
  top: number;
  planning: boolean;
  query: string;
  recent: Place[];
  places: Place[] | undefined;
  fetching: boolean;
  error: string;
  shortcuts: { home: Place | null; work: Place | null };
  shortcutBusy: boolean;
  onCurrent: () => void;
  onClearHistory: () => void;
  onChoose: (place: Place) => void;
  onSaved: () => void;
  transitOnly?: boolean;
  onMap?: (filter: SearchResultFilter) => void;
  onShortcut: (slot: 'home' | 'work') => void;
};

/** 결과 분류는 이미 받은 목록에서 수행한다. 탭을 바꿀 때 동일 검색 API를 다시 호출하지 않는다. */
export function PlaceSearchResults({
  top,
  planning,
  query,
  recent,
  places,
  fetching,
  error,
  shortcuts,
  shortcutBusy,
  onCurrent,
  onClearHistory,
  onChoose,
  onSaved,
  onShortcut,
  onMap,
  transitOnly = false,
}: Props) {
  /** 동일 검색 결과에 적용할 화면 분류다. 서버 응답을 상태에 복사하지 않는다. */
  const [filter, setFilter] = useState<SearchResultFilter>('all');
  const activeFilter = transitOnly && filter === 'place' ? 'all' : filter;

  /** 입력 전에는 최근 기록을, 입력 뒤에는 선택한 분류에 해당하는 실제 결과만 표시한다. */
  const rows =
    query.length < 2
      ? recent.filter(place => !transitOnly || isBusStopPlace(place) || place.id.startsWith('subway:') || /지하철|전철|도시철도/.test(place.category))
      : (places ?? []).filter(place => matchesSearchFilter(place, activeFilter));

  return (
    <View style={[styles.container, { top }]}>
      {planning ? (
        <Pressable accessibilityRole="button" onPress={onCurrent} style={styles.current}>
          <SymbolView
            name={{ ios: 'scope', android: 'my_location' }}
            size={20}
            tintColor={mapUi.blue}
          />
          <Text style={styles.currentText}>현재 위치</Text>
        </Pressable>
      ) : null}
      <View style={styles.shortcuts}>
        {(['home', 'work'] as const).map((slot) => (
          <Pressable
            key={slot}
            accessibilityRole="button"
            accessibilityLabel={`${slot === 'home' ? '집' : '회사'} ${shortcuts[slot] ? '선택' : '등록'}`}
            disabled={shortcutBusy}
            onPress={() => onShortcut(slot)}
            style={styles.shortcut}
          >
            <SymbolView
              name={
                slot === 'home'
                  ? { ios: 'house', android: 'home' }
                  : { ios: 'building.2', android: 'business' }
              }
              size={20}
              tintColor="#676C72"
            />
            <Text style={styles.shortcutText}>
              {slot === 'home' ? '집' : '회사'}
              {shortcuts[slot] ? '' : ' 등록'}
            </Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={onSaved}
          style={[styles.shortcut, styles.saved]}
        >
          <SymbolView
            name={{ ios: 'star', android: 'star_border' }}
            size={20}
            tintColor="#676C72"
          />
          <Text style={styles.shortcutText}>저장</Text>
        </Pressable>
      </View>
      {query.length >= 2 ? (
        <View style={styles.tabs}>
          {(transitOnly ? (['all', 'stop', 'subway'] as const) : (['all', 'place', 'stop', 'subway'] as const)).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeFilter === value }}
              onPress={() => setFilter(value)}
              style={[styles.tab, activeFilter === value && styles.activeTab]}
            >
              <Text style={[styles.tabText, activeFilter === value && styles.activeText]}>
                {value === 'all'
                  ? '전체'
                  : value === 'place'
                    ? '장소'
                    : value === 'stop'
                      ? '정류장'
                      : '지하철'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.historyHeading}>
          <Text style={styles.historyTitle}>최근 검색</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="최근 검색 지우기"
            onPress={onClearHistory}
            style={styles.clear}
          >
            <Text style={styles.muted}>전체 삭제</Text>
          </Pressable>
        </View>
      )}
      {onMap ? <Pressable accessibilityRole="button" onPress={() => onMap(activeFilter)}
        style={{ alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 12, minHeight: 44 }}>
        <Text style={styles.currentText}>지도에서 보기</Text>
      </Pressable> : null}
      {fetching ? <ActivityIndicator style={styles.loading} color={mapUi.blue} /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(place) => place.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <PlaceSearchRow place={item} recent={query.length < 2} onChoose={onChoose} />
        )}
        ListEmptyComponent={
          !fetching && query.length >= 2 ? (
            <Text style={styles.empty}>검색 결과가 없습니다.</Text>
          ) : null
        }
      />
    </View>
  );
}

/** 최근 기록에는 시계, 검색 결과에는 장소 분류 아이콘을 사용하고 이름·주소·거리를 표시한다. */
function PlaceSearchRow({
  place,
  recent,
  onChoose,
}: {
  place: Place;
  recent: boolean;
  onChoose: (place: Place) => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={() => onChoose(place)} style={styles.row}>
      <SymbolView
        name={
          recent
            ? { ios: 'clock', android: 'history' }
            : isBusStopPlace(place)
              ? { ios: 'bus', android: 'directions_bus' }
              : isSubwayPlace(place)
                ? { ios: 'tram', android: 'subway' }
                : { ios: 'mappin.circle', android: 'location_on' }
        }
        size={21}
        tintColor="#969AA0"
      />
      <View style={styles.place}>
        <Text style={styles.placeName}>{place.name.replace(/\[.*?\]/g, '')}</Text>
        <Text style={styles.address}>{place.address || place.category}</Text>
      </View>
      {place.distanceMeters !== null ? (
        <Text style={styles.distance}>
          {place.distanceMeters >= 1000
            ? `${(place.distanceMeters / 1000).toFixed(1)}km`
            : `${Math.round(place.distanceMeters)}m`}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** 검색 화면의 고정 시각 규격이다. 배열·스타일 캐시용 훅이 필요 없다. */
const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#FFFFFF' },
  current: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F2',
  },
  currentText: { color: mapUi.blue, fontSize: 16, fontWeight: '600' },
  shortcuts: {
    flexDirection: 'row',
    borderBottomWidth: 7,
    borderBottomColor: '#F4F5F6',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  shortcut: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 48, marginRight: 25 },
  shortcutText: { color: '#52565B', fontSize: 15 },
  saved: { marginLeft: 'auto', marginRight: 0 },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EBECEE',
  },
  tab: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: mapUi.text },
  tabText: { color: '#969AA0', fontSize: 15 },
  activeText: { color: mapUi.text, fontWeight: '700' },
  historyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F1F2',
  },
  historyTitle: { color: mapUi.text, fontSize: 16, fontWeight: '600' },
  clear: { minHeight: 44, justifyContent: 'center' },
  muted: { color: '#969AA0', fontSize: 13 },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F5F6',
  },
  place: { flex: 1, gap: 5 },
  placeName: { fontSize: 16, color: mapUi.text },
  address: { fontSize: 12, color: '#969AA0' },
  distance: { fontSize: 12, color: '#969AA0' },
  error: { padding: 16, color: '#DF453B' },
  loading: { padding: 12 },
  empty: { padding: 24, textAlign: 'center', color: '#969AA0' },
});
