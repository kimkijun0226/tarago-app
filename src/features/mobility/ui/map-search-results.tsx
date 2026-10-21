/** @fileoverview 검색 결과 핀과 같은 순번을 가진 지도 하단 목록을 표시한다. */
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Place } from '../api/mobility';
import { mapUi } from '@/shared/ui/map-design-tokens';

type Props = {
  query: string;
  places: Place[];
  selectedId: string | null;
  onSelect: (place: Place) => void;
  onChoose: (place: Place) => void;
  onClose: () => void;
};

export function MapSearchResults({
  query,
  places,
  selectedId,
  onSelect,
  onChoose,
  onClose,
}: Props) {
  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <View style={styles.titleArea}>
          <Text numberOfLines={1} style={styles.title}>
            {query}
          </Text>
          <Text style={styles.subtitle}>검색 결과 {places.length}곳</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.action}>
          <Text style={styles.link}>목록 보기</Text>
        </Pressable>
      </View>
      <FlatList
        data={places}
        keyExtractor={(place) => place.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>표시할 검색 결과가 없습니다.</Text>}
        renderItem={({ item, index }) => (
          <View style={[styles.row, selectedId === item.id && styles.selected]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${index + 1}. ${item.name} 지도에서 선택`}
              onPress={() => onSelect(item)}
              style={styles.place}
            >
              <Text style={styles.number}>{index + 1}</Text>
              <View style={styles.titleArea}>
                <Text numberOfLines={1} style={styles.name}>
                  {item.name}
                </Text>
                <Text numberOfLines={1} style={styles.subtitle}>
                  {item.address || item.category}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name} 상세 보기`}
              onPress={() => onChoose(item)}
              style={styles.action}
            >
              <Text style={styles.link}>상세</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: mapUi.border,
  },
  titleArea: { flex: 1, gap: 4 },
  title: { fontSize: 19, fontWeight: '700', color: mapUi.text },
  subtitle: { fontSize: 12, color: mapUi.secondaryText },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: mapUi.border,
  },
  selected: { backgroundColor: mapUi.blueSurface },
  place: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 76,
    paddingVertical: 12,
  },
  number: { color: mapUi.blue, fontSize: 17, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  name: { color: mapUi.text, fontSize: 16, fontWeight: '600' },
  action: { minWidth: 52, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  link: { color: mapUi.blue, fontSize: 14, fontWeight: '600' },
  empty: { padding: 24, color: mapUi.secondaryText, textAlign: 'center' },
});
