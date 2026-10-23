/** 지도 검색 진입 버튼과 검색어 지우기·검색 종료 동작을 분리한다. */
import { mapUi } from '@/shared/ui/map-design-tokens';
import { SymbolView } from 'expo-symbols';
import type { RefObject } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  open: boolean;
  resultsVisible: boolean;
  value: string;
  placeholder: string;
  inputRef: RefObject<TextInput | null>;
  onOpen: () => void;
  onClose: () => void;
  onText: (text: string) => void;
  onSubmit: () => void;
};

export function MobilitySearchBar({
  open,
  resultsVisible,
  value,
  placeholder,
  inputRef,
  onOpen,
  onClose,
  onText,
  onSubmit,
}: Props) {
  return (
    <View style={styles.row}>
      {open && !resultsVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색 닫기"
          onPress={onClose}
          hitSlop={7}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back' }}
            size={18}
            tintColor={mapUi.text}
          />
        </Pressable>
      ) : null}
      <View style={[styles.pill, open && !resultsVisible && styles.editingPill]}>
        {open && !resultsVisible ? (
          <TextInput
            autoFocus
            ref={inputRef}
            value={value}
            onChangeText={onText}
            maxLength={100}
            accessibilityLabel="검색어"
            placeholder={placeholder}
            placeholderTextColor={mapUi.secondaryText}
            style={styles.input}
            returnKeyType="search"
            onSubmitEditing={onSubmit}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="검색 목록 열기"
            onPress={onOpen}
            style={styles.entry}
          >
            <Text numberOfLines={1} style={styles.placeholder}>
              {value || placeholder}
            </Text>
          </Pressable>
        )}
        {open && (value || resultsVisible) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={resultsVisible ? '검색어 지우기' : '검색 닫고 지도로 돌아가기'}
            onPress={resultsVisible ? () => onText('') : onClose}
            hitSlop={resultsVisible ? 10 : 0}
            style={[styles.clear, resultsVisible && styles.clearCircle]}
          >
            <SymbolView
              name={{ ios: 'xmark', android: 'close' }}
              size={resultsVisible ? 11 : 18}
              tintColor={resultsVisible ? '#FFFFFF' : mapUi.secondaryText}
            />
          </Pressable>
        ) : null}
      </View>
      {!open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색"
          onPress={onOpen}
          style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
        >
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search' }}
            size={22}
            weight="semibold"
            tintColor="#FFFFFF"
          />
        </Pressable>
      ) : resultsVisible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색 종료"
          onPress={onClose}
          style={({ pressed }) => [styles.endSearch, pressed && styles.pressed]}
        >
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={18} tintColor={mapUi.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: {
    flex: 1,
    minWidth: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    paddingLeft: 12,
    paddingRight: 10,
    borderWidth: 1.25,
    borderBottomWidth: 2,
    borderColor: mapUi.border,
    boxShadow: '0px 2px 8px #2222220A',
  },
  editingPill: { height: 44, borderRadius: 22, borderBottomWidth: 1.25, boxShadow: 'none' },
  entry: {
    flex: 1,
    minWidth: 0,
    height: 50,
    paddingLeft: 8,
    justifyContent: 'center',
    paddingRight: 8,
  },
  placeholder: { fontSize: 15, color: mapUi.secondaryText, fontWeight: '500' },
  input: { flex: 1, minWidth: 0, height: 40, color: mapUi.text, fontSize: 15, paddingVertical: 0 },
  back: { width: 30, height: 44, alignItems: 'center', justifyContent: 'center' },
  endSearch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.25,
    borderColor: mapUi.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#A4A6AC',
    marginHorizontal: 8,
  },
  clear: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  submit: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: mapUi.brand,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 1px 0px #D92850',
  },
  submitPressed: { backgroundColor: '#D92850', transform: [{ translateY: 1 }, { scale: 0.96 }] },
  pressed: { opacity: 0.7 },
});
