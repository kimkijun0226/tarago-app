/** @fileoverview 기본 지도 검색창과 닫기 버튼이 있는 검색 입력창. */
import type { RefObject } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { mapUi } from '@/shared/ui/map-design-tokens';

type Props = {
  open: boolean;
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
  value,
  placeholder,
  inputRef,
  onOpen,
  onClose,
  onText,
  onSubmit,
}: Props) {
  const logo = (
    <View style={styles.logo}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search' }}
        size={21}
        tintColor="#FFFFFF"
      />
    </View>
  );
  return (
    <View style={styles.row}>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색 닫기"
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={22} tintColor={mapUi.text} />
        </Pressable>
      ) : null}
      <View style={[styles.pill, open && styles.searchPill]}>
        {open ? (
          <>
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onText}
              maxLength={100}
              placeholder={placeholder}
              placeholderTextColor={mapUi.secondaryText}
              style={styles.input}
              returnKeyType="search"
              onSubmitEditing={onSubmit}
            />
            {value ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="검색어 지우기"
                onPress={() => onText('')}
                style={styles.clear}
              >
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'cancel' }}
                  size={18}
                  tintColor={mapUi.secondaryText}
                />
              </Pressable>
            ) : null}
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="장소 검색"
            onPress={onOpen}
            style={({ pressed }) => [styles.search, pressed && styles.pressed]}
          >
            {logo}
            <Text numberOfLines={1} style={styles.placeholder}>
              타라고 검색
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: {
    flex: 1,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 28,
    backgroundColor: mapUi.background,
    paddingLeft: 16,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: mapUi.border,
    boxShadow: '0 4px 0 #2222220C, 0 5px 12px #2222220A',
  },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, height: 56 },
  searchPill: {
    borderRadius: 28,
    paddingHorizontal: 16,
    borderColor: mapUi.accentBorder,
  },
  close: {
    width: 44,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: mapUi.brand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: { fontSize: 17, color: mapUi.text, flex: 1 },
  input: { flex: 1, minWidth: 0, height: 56, color: mapUi.text, fontSize: 17, paddingVertical: 0 },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { transform: [{ scale: 0.97 }, { translateY: 1 }] },
});
