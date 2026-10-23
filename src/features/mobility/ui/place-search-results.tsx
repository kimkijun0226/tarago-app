/** @fileoverview 정류장·지하철역 검색 결과와 최근 검색을 표시한다. */
import { SearchPlaceKind } from './search-place-kind';
import { useState } from 'react';
import { Keyboard, ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Place } from '../api/mobility';
import {
  isBusStopPlace,
  matchesSearchFilter,
  type SearchResultFilter,
} from '../model/place-kind';
import { mapUi } from '@/shared/ui/map-design-tokens';

type Props = {
  top: number;
  fixedFilter?: SearchResultFilter;
  query: string;
  recent: Place[];
  places: Place[] | undefined;
  fetching: boolean;
  error: string;
  onClearHistory: () => void;
  onChoose: (place: Place) => void;
  transitOnly?: boolean;
};

/** 결과 분류는 이미 받은 목록에서 수행한다. 탭을 바꿀 때 동일 검색 API를 다시 호출하지 않는다. */
export function PlaceSearchResults({
  top,
  fixedFilter,
  query,
  recent,
  places,
  fetching,
  error,
  onClearHistory,
  onChoose,
  transitOnly = false,
}: Props) {
  /** 동일 검색 결과에 적용할 화면 분류다. 서버 응답을 상태에 복사하지 않는다. */
  const [filter, setFilter] = useState<SearchResultFilter>('all');
  const activeFilter = fixedFilter ?? (transitOnly && filter === 'place' ? 'all' : filter);

  /** 입력 전에는 최근 기록을, 입력 뒤에는 선택한 분류에 해당하는 실제 결과만 표시한다. */
  const rows =
    query.length < 2
      ? recent.filter(
          (place) =>
            (!fixedFilter || matchesSearchFilter(place, fixedFilter)) &&
            (!transitOnly ||
              isBusStopPlace(place) ||
              place.id.startsWith('subway:') ||
              /지하철|전철|도시철도/.test(place.category)),
        )
      : (places ?? []).filter((place) => matchesSearchFilter(place, activeFilter));

  return (
    <View onTouchStart={() => Keyboard.dismiss()} style={[styles.container, { top }]}>
      {query.length >= 2 && !fixedFilter ? (
        <View style={styles.tabs}>
          {(transitOnly
            ? (['all', 'stop', 'subway'] as const)
            : (['all', 'place', 'stop', 'subway'] as const)
          ).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeFilter === value }}
              onPress={() => setFilter(value)}
              style={({ pressed }) => [
                styles.tab,
                activeFilter === value && styles.activeTab,
                pressed && styles.pressed,
              ]}
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
          <Text style={styles.historyTitle}>{query.length >= 2 ? '검색 결과' : '최근 검색'}</Text>
          {query.length < 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="최근 검색 지우기"
              onPress={onClearHistory}
              style={styles.clear}
            >
              <Text style={styles.muted}>전체 삭제</Text>
            </Pressable>
          ) : null}
        </View>
      )}
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
          <PlaceSearchRow place={item} onChoose={onChoose} />
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

/** 최근 기록과 검색 결과에 같은 장소 분류 아이콘을 표시한다. */
function PlaceSearchRow({
  place,
  onChoose,
}: {
  place: Place;
  onChoose: (place: Place) => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onChoose(place)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <SearchPlaceKind place={place} />
      <View style={styles.place}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.placeName}>{place.name.replace(/\[.*?\]/g, '')}</Text>
        </View>
        <Text style={styles.address}>{place.address}</Text>
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
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: mapUi.background,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: mapUi.border,
  },
  tab: {
    minHeight: 44,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: { borderBottomColor: mapUi.text },
  tabText: { color: mapUi.secondaryText, fontSize: 13 },
  activeText: { color: mapUi.text, fontWeight: '700' },
  historyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 50,
  },
  historyTitle: { color: mapUi.text, fontSize: 16, fontWeight: '600' },
  clear: { minHeight: 44, justifyContent: 'center' },
  muted: { color: mapUi.secondaryText, fontSize: 13 },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E5E8',
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 72,
    backgroundColor: mapUi.background,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  place: { flex: 1, gap: 4 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  placeName: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: mapUi.text },
  address: { fontSize: 11, lineHeight: 16, color: mapUi.secondaryText },
  distance: { fontSize: 11, fontWeight: '500', color: mapUi.secondaryText },
  error: { padding: 16, color: mapUi.blue },
  loading: { padding: 12 },
  pressed: { backgroundColor: mapUi.separator, transform: [{ translateY: 1 }, { scale: 0.99 }] },
  empty: { padding: 24, textAlign: 'center', color: mapUi.secondaryText },
});
