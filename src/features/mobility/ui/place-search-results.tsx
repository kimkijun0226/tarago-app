/** @fileoverview 정류장·지하철역 검색 결과와 최근 검색을 표시한다. */
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { Place } from '../api/mobility';
import {
  isBusStopPlace,
  isSubwayPlace,
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
  onMap?: (filter: SearchResultFilter) => void;
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
  onMap,
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
    <View style={[styles.container, { top }]}>
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
      {onMap ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onMap(activeFilter)}
          style={{
            alignSelf: 'flex-end',
            paddingHorizontal: 20,
            paddingVertical: 12,
            minHeight: 44,
          }}
        >
          <Text style={styles.mapActionText}>지도에서 보기</Text>
        </Pressable>
      ) : null}
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
    <Pressable
      accessibilityRole="button"
      onPress={() => onChoose(place)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
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
        tintColor={mapUi.secondaryText}
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
  mapActionText: { color: mapUi.blue, fontSize: 15, fontWeight: '600' },
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
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: mapUi.border,
  },
  tab: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 18,
    marginVertical: 8,
    borderColor: 'transparent',
  },
  activeTab: { backgroundColor: mapUi.blueSurface, borderColor: mapUi.accentBorder },
  tabText: { color: mapUi.secondaryText, fontSize: 15 },
  activeText: { color: mapUi.blue, fontWeight: '700' },
  historyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    minHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: mapUi.separator,
  },
  historyTitle: { color: mapUi.text, fontSize: 16, fontWeight: '600' },
  clear: { minHeight: 44, justifyContent: 'center' },
  muted: { color: mapUi.secondaryText, fontSize: 13 },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: mapUi.separator,
  },
  place: { flex: 1, gap: 4 },
  placeName: { fontSize: 16, color: mapUi.text },
  address: { fontSize: 12, color: mapUi.secondaryText },
  distance: { fontSize: 12, color: mapUi.secondaryText },
  error: { padding: 16, color: mapUi.blue },
  loading: { padding: 12 },
  pressed: { backgroundColor: mapUi.blueSurface, transform: [{ scale: 0.99 }] },
  empty: { padding: 24, textAlign: 'center', color: mapUi.secondaryText },
});
