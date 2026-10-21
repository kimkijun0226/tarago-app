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
  onSaved: () => void;
  onDirections: () => void;
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
  onSaved,
  onDirections,
}: Props) {
  const logo = (
    <View style={styles.logo}>
      <Text style={styles.logoText}>T</Text>
    </View>
  );
  return (
    <View style={styles.row}>
      {open ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색 닫기"
          onPress={onClose}
          style={styles.close}
        >
          <SymbolView
            name={{ ios: 'xmark', android: 'close' }}
            size={22}
            tintColor={mapUi.text}
          />
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
            style={styles.search}
          >
            {logo}
            <Text numberOfLines={1} style={styles.placeholder}>
              타라고 검색
            </Text>
          </Pressable>
        )}
        {!open ? <Pressable
          accessibilityRole="button"
          accessibilityLabel="내 장소"
          onPress={onSaved}
          style={styles.saved}
        >
          <SymbolView
            name={{ ios: 'person.fill', android: 'person' }}
            size={23}
            tintColor="#559C8A"
          />
        </Pressable> : null}
      </View>
      {!open ? <Pressable
        accessibilityRole="button"
        accessibilityLabel="길찾기"
        onPress={onDirections}
        style={styles.directions}
      >
        <SymbolView
          name={{ ios: 'arrow.turn.up.right', android: 'turn_right' }}
          size={28}
          tintColor="#FFFFFF"
        />
      </Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  pill: {
    flex: 1,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 28,
    backgroundColor: mapUi.background,
    paddingLeft: 16,
    paddingRight: 12,
    boxShadow: '0 2px 6px #00000024',
  },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, height: 50 },
  searchPill: {
    borderRadius: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  close: {
    width: 44,
    height: 50,
    borderRadius: 16,
    backgroundColor: mapUi.background,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px #00000024',
  },
  logo: {
    width: 26,
    height: 31,
    borderRadius: 14,
    borderBottomRightRadius: 4,
    backgroundColor: mapUi.blue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: { fontSize: 20, color: '#FFFFFF', fontWeight: '800' },
  placeholder: { fontSize: 17, color: '#44474A', flex: 1 },
  input: { flex: 1, minWidth: 0, height: 50, color: mapUi.text, fontSize: 17, paddingVertical: 0 },
  clear: { minWidth: 24, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  saved: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DBEEEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directions: {
    height: 50,
    width: 50,
    borderRadius: 25,
    backgroundColor: mapUi.blue,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 6px #00000024',
  },
});
