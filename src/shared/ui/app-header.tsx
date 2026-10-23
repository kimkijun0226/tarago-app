import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { appColors as c } from './theme';

/** 바깥 여백은 화면 본문에 맞추고, 뒤로가기 아이콘에는 추가 좌우 패딩을 넣지 않는다. */
export function AppHeader({
  title,
  onBack,
  backLabel = '뒤로가기',
  disabled = false,
  large = false,
  right,
}: {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  disabled?: boolean;
  large?: boolean;
  right?: ReactNode;
}) {
  return (
    <View style={s.row}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          disabled={disabled}
          onPress={onBack}
          hitSlop={{ left: 12, right: 10, top: 0, bottom: 0 }}
          style={s.back}
        >
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back' }}
            size={20}
            tintColor={c.accent}
          />
        </Pressable>
      ) : null}
      <View style={s.titleArea}>
        <Text accessibilityRole="header" numberOfLines={1} style={[s.title, large && s.large]}>
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}
const s = StyleSheet.create({
  row: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 22, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  titleArea: { flex: 1, minWidth: 0, height: 44, justifyContent: 'center' },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: c.text,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  large: { fontSize: 30, lineHeight: 36 },
});
