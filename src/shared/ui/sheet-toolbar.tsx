/** @fileoverview 바텀 시트의 공통 추가 동작·닫기 버튼 배치를 담당한다. */
import { SymbolView } from 'expo-symbols';
import bold from 'expo-symbols/androidWeights/bold';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { mapUi } from './map-design-tokens';

type SheetToolbarProps = {
  /** 시트를 닫을 때 실행할 화면별 동작이다. */
  onClose?: () => void;
  /** 닫기 버튼을 음성으로 안내할 이름이다. */
  closeLabel?: string;
  /** 버튼 옆에 표시할 제목과 부가 정보다. */
  header?: ReactNode;
  /** 즐겨찾기 등 화면별 추가 버튼이다. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** 시트 내용과 별도로 배치하는 공통 툴바다. */
export function SheetToolbar({
  onClose,
  closeLabel = '닫기',
  header,
  children,
  style,
}: SheetToolbarProps) {
  return (
    <View style={[styles.toolbar, style]}>
      {header ? <View style={styles.header}>{header}</View> : null}
      <View style={styles.actions}>
        {children}
        {onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onClose}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <SymbolView
              name={{ ios: 'xmark', android: 'close' }}
              weight={{ ios: 'bold', android: bold }}
              size={18}
              tintColor={mapUi.blue}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  header: { flex: 1, minWidth: 0 },
  actions: {
    flexShrink: 0,
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 6,
  },
  pressed: { transform: [{ translateY: 1 }, { scale: 0.97 }], boxShadow: 'none' },
  button: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
