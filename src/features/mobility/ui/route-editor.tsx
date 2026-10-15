/** @fileoverview 길찾기 상단의 출발·도착 입력, 순서 교환과 교통수단 탭을 표시한다. 검색 결과와 경로 조회는 부모가 관리한다. */
import type { RefObject } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { Place, TravelMode } from '../api/mobility';
import { mapUi } from '@/shared/ui/map-design-tokens';

type Props = {
  start: Place | null;
  end: Place | null;
  mode: TravelMode;
  hasRequest: boolean;
  positionBusy: boolean;
  editingField?: 'start' | 'end';
  text: string;
  inputRef: RefObject<TextInput | null>;
  duration?: number;
  onText: (value: string) => void;
  onSubmit: () => void;
  edit: (field: 'start' | 'end') => void;
  onSwap: () => void;
  onClose: () => void;
  onMode: (mode: TravelMode) => void;
};

/** 검색 전·편집 중에는 두 입력을 유지하고, 경로 조회 뒤에는 한 줄 요약으로 전환한다. */
export function RouteEditor({
  start,
  end,
  mode,
  hasRequest,
  positionBusy,
  editingField,
  text,
  inputRef,
  duration,
  onText,
  onSubmit,
  edit,
  onSwap,
  onClose,
  onMode,
}: Props) {
  /** 조회 후 검색창을 접되 출발·도착 수정 중에는 두 줄 입력을 다시 표시한다. */
  const compact = hasRequest && !editingField;

  return (
    <View style={styles.header}>
      <View style={styles.endpointBox}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="출발 도착 바꾸기"
          onPress={onSwap}
          style={styles.swap}
        >
          <SymbolView
            name={{ ios: 'arrow.up.arrow.down', android: 'swap_vert' }}
            size={23}
            tintColor="#777B80"
          />
        </Pressable>
        <View style={[styles.fields, compact && styles.compact]}>
          {(['start', 'end'] as const).map((field) => (
            <View key={field} style={[styles.endpoint, compact && styles.compactEndpoint]}>
              <View
                style={[
                  styles.point,
                  { backgroundColor: field === 'start' ? '#00C75A' : '#FF4438' },
                ]}
              />
              {editingField === field ? (
                <TextInput
                  ref={inputRef}
                  accessibilityLabel={field === 'start' ? '출발지 검색' : '도착지 검색'}
                  value={text}
                  onChangeText={onText}
                  onSubmitEditing={onSubmit}
                  placeholder={field === 'start' ? '출발지 입력' : '도착지 입력'}
                  placeholderTextColor="#9A9DA1"
                  style={styles.input}
                  returnKeyType="search"
                  maxLength={100}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${field === 'start' ? '출발지' : '도착지'} ${(field === 'start' ? start : end)?.name ?? '입력'}`}
                  onPress={() => edit(field)}
                  style={styles.fieldButton}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.endpointText,
                      !(field === 'start' ? start : end) && styles.placeholder,
                    ]}
                  >
                    {(field === 'start' ? start : end)?.name.replace(/\[.*?\]/g, '') ??
                      (field === 'start' ? '출발지 입력' : '도착지 입력')}
                  </Text>
                </Pressable>
              )}
              {editingField === field && text ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="검색어 지우기"
                  onPress={() => onText('')}
                  style={styles.clear}
                >
                  <SymbolView
                    name={{ ios: 'xmark.circle.fill', android: 'cancel' }}
                    size={18}
                    tintColor="#B3B5B8"
                  />
                </Pressable>
              ) : null}
              {compact && field === 'start' ? <Text style={styles.arrow}>→</Text> : null}
            </View>
          ))}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="길찾기 닫기"
          onPress={onClose}
          style={styles.close}
        >
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={21} tintColor="#777B80" />
        </Pressable>
      </View>
      <View style={styles.modes}>
        {(['transit', 'walk'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityLabel={value === 'transit' ? '대중교통' : '도보'}
            accessibilityState={{ selected: value === (mode === 'bus' ? 'transit' : mode) }}
            onPress={() => onMode(value)}
            style={styles.modeSlot}
          >
            <View
              style={[
                styles.mode,
                value === (mode === 'bus' ? 'transit' : mode) && styles.selectedMode,
              ]}
            >
              <SymbolView
                name={
                  value === 'walk'
                    ? { ios: 'figure.walk', android: 'directions_walk' }
                    : { ios: 'bus.fill', android: 'directions_bus' }
                }
                size={24}
                tintColor={value === (mode === 'bus' ? 'transit' : mode) ? '#FFFFFF' : '#484B4E'}
              />
              <Text
                style={[
                  styles.modeText,
                  value === (mode === 'bus' ? 'transit' : mode) && styles.selectedText,
                ]}
              >
                {value === (mode === 'bus' ? 'transit' : mode) && duration !== undefined
                  ? `${duration}분`
                  : value === 'transit'
                    ? '대중교통'
                    : '도보'}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
      {positionBusy ? <ActivityIndicator color={mapUi.blue} style={styles.busy} /> : null}
    </View>
  );
}

/** 고정 시각 규격은 모듈에서 재사용한다. 렌더마다 계산할 값이 없어 useMemo를 두지 않는다. */
const styles = StyleSheet.create({
  header: {
    backgroundColor: '#FFFFFF',
    paddingTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#EBECEE',
  },
  endpointBox: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DFE1E4',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  swap: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  fields: { flex: 1 },
  compact: { flexDirection: 'row', alignItems: 'center' },
  endpoint: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 9 },
  compactEndpoint: { flex: 1 },
  point: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    boxShadow: '0 0 0 2px #ECEFF1',
  },
  input: { flex: 1, fontSize: 16, color: mapUi.text, paddingVertical: 10, minHeight: 44 },
  fieldButton: { flex: 1, minHeight: 44, justifyContent: 'center' },
  endpointText: { fontSize: 16, color: mapUi.text },
  placeholder: { color: '#9A9DA1' },
  close: { width: 42, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  clear: { width: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  arrow: { color: '#96999C', fontSize: 20, marginRight: 8 },
  modes: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 2,
  },
  modeSlot: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  mode: {
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 16,
    minHeight: 36,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedMode: { backgroundColor: mapUi.blue },
  modeText: { fontSize: 14, color: '#484B4E' },
  selectedText: { color: '#FFFFFF' },
  busy: { paddingBottom: 8 },
});
