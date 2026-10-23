/** @fileoverview 검색 결과 핀과 같은 순번을 가진 지도 하단 목록을 표시한다. */
import { Keyboard, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SearchPlaceKind } from './search-place-kind';
import type { Place } from '../api/mobility';
import { mapUi } from '@/shared/ui/map-design-tokens';

type Props = {
  places: Place[];
  selectedId: string | null;
  onSelect: (place: Place) => void;
  onChoose: (place: Place) => void;
};

/** 드래그 핸들 안에 두어 접힌 검색 시트에서도 제목만 유지한다. */
export function MapSearchResultsHeader({ query, count, onClose }: {
  query: string; count: number; onClose: () => void;
}) {
  return (
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text numberOfLines={1} style={styles.title}>
            {query}
          </Text>
          <Text style={styles.subtitle}>검색 결과 {count}곳</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색 목록 보기"
          onPress={onClose}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <SymbolView name={{ ios: 'list.bullet', android: 'format_list_bulleted' }} size={20} tintColor={mapUi.text} />
        </Pressable>
      </View>
  );
}

export function MapSearchResults({
  places,
  selectedId,
  onSelect,
  onChoose,
}: Props) {
  return (
    <View onTouchStart={() => Keyboard.dismiss()} style={styles.content}>

      <FlatList
        data={places}
        keyExtractor={(place) => place.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<Text style={styles.empty}>표시할 검색 결과가 없습니다.</Text>}
        renderItem={({ item, index }) => (
          <View style={[styles.row, selectedId === item.id && styles.selected]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}. ${item.name} 지도에서 선택`}
              onPress={() => onSelect(item)}
              style={({ pressed }) => [styles.place, pressed && styles.pressed]}
            >
              <Text style={styles.number}>{index + 1}</Text>
              <View style={styles.titleArea}>
                <View style={styles.nameRow}>
                  <Text numberOfLines={1} style={styles.name}>{item.name}</Text>
                  <SearchPlaceKind place={item} />
                </View>
                <Text numberOfLines={1} style={styles.subtitle}>
                  {item.address}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name} 상세 보기`}
              onPress={() => onChoose(item)}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={16} tintColor={mapUi.secondaryText} />
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, backgroundColor: mapUi.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  titleArea: { flex: 1, gap: 4 },
  title: { fontSize: 17, fontWeight: '700', color: mapUi.text },
  subtitle: { fontSize: 12, color: mapUi.secondaryText },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4E5E8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 0,
    backgroundColor: mapUi.background,
  },
  selected: { backgroundColor: mapUi.separator },
  place: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 16,
  },
  number: { color: mapUi.secondaryText, fontSize: 12, fontWeight: '500', minWidth: 18, textAlign: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { flexShrink: 1, color: mapUi.text, fontSize: 16, fontWeight: '700' },
  action: { minWidth: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: mapUi.blueSurface, transform: [{ scale: 0.98 }, { translateY: 1 }] },
  empty: { padding: 24, color: mapUi.secondaryText, textAlign: 'center' },
});
