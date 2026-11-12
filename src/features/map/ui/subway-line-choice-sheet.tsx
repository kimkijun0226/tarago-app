import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import type { SubwayMapStation } from '@/features/subway/api/get-subway-station';
import { LINE_COLORS } from '@/features/subway/model/subway-line-colors';
import { MapBottomSheet } from '@/shared/ui/map-bottom-sheet';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { SheetToolbar } from '@/shared/ui/sheet-toolbar';

type Props = {
  stations: SubwayMapStation[];
  onSelect: (station: SubwayMapStation) => void;
  onClose: () => void;
  onHeightChange: (height: number) => void;
  animatedPosition: SharedValue<number>;
};

export function SubwayLineChoiceSheet({ stations, onSelect, onClose, onHeightChange, animatedPosition }: Props) {
  const stationName = stations[0]?.name.replace(/역$/, '');
  return (
    <MapBottomSheet
      onHeightChange={onHeightChange}
      animatedPosition={animatedPosition}
      toolbar={
        <SheetToolbar onClose={onClose} closeLabel="호선 선택 닫기" header={
          <View style={styles.heading}>
            <Text style={styles.station}>{stationName}역</Text>
            <Text style={styles.title}>어느 호선을 볼까요?</Text>
          </View>
        } />
      }
    >
      <BottomSheetScrollView contentContainerStyle={styles.list}>
        {stations.map((station) => {
          const color = LINE_COLORS[station.lineName] ?? mapUi.blue;
          return (
            <Pressable
              key={station.lineName}
              accessibilityRole="button"
              accessibilityLabel={`${station.lineName} 도착정보 보기`}
              onPress={() => onSelect(station)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={[styles.icon, { backgroundColor: color }]}>
                <SymbolView name={{ ios: 'tram.fill', android: 'train' }} size={17} tintColor="#FFFFFF" />
              </View>
              <Text style={styles.line}>{station.lineName}</Text>
              <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} tintColor={mapUi.secondaryText} />
            </Pressable>
          );
        })}
      </BottomSheetScrollView>
    </MapBottomSheet>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 4 },
  station: { color: mapUi.secondaryText, fontSize: 14, fontWeight: '600' },
  title: { color: mapUi.text, fontSize: 22, fontWeight: '700' },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  row: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, borderRadius: 12, backgroundColor: mapUi.background,
    borderWidth: StyleSheet.hairlineWidth, borderColor: mapUi.separator,
  },
  pressed: { backgroundColor: mapUi.blueSurface },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, fontSize: 16, fontWeight: '700', color: mapUi.text },
});
