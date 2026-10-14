import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

const palettes = {
  light: { background: '#F2F2F7', surface: '#FFFFFF', secondarySurface: '#E5E5EA', text: '#1C1C1E', secondaryText: '#636366', tertiaryText: '#8E8E93', separator: '#D1D1D6', accent: '#007AFF', accentSurface: '#EAF3FF', onAccent: '#FFFFFF', danger: '#FF3B30', warning: '#8A5900', warningSurface: '#FFF4D6', success: '#248A3D' },
};
const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
const radius = { sm: 8, md: 12, lg: 16, sheet: 24 };
const type = { largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.3 }, title: { fontSize: 22, fontWeight: '700' as const }, headline: { fontSize: 17, fontWeight: '600' as const }, body: { fontSize: 17, lineHeight: 24 }, footnote: { fontSize: 13, lineHeight: 19 } };

/** 지도와 알림 화면은 기기 다크 모드와 관계없이 같은 밝은 테마를 사용한다. */
export function useAppTheme() {
  const isDark = false;
  return { colors: palettes.light, spacing, radius, type, isDark };
}

export function AppButton({ title, onPress, disabled = false, loading = false, variant = 'primary' }: { title: string; onPress: () => void; disabled?: boolean; loading?: boolean; variant?: 'primary' | 'secondary' | 'destructive' }) {
  const { colors } = useAppTheme();
  const foreground = variant === 'primary' ? colors.onAccent : variant === 'destructive' ? colors.danger : colors.accent;
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => ({ minHeight: 50, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: variant === 'primary' ? colors.accent : colors.secondarySurface, opacity: disabled || loading ? 0.5 : pressed ? 0.7 : 1 })}>
    {loading ? <ActivityIndicator color={foreground} /> : <Text style={{ color: foreground, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>{title}</Text>}
  </Pressable>;
}

export function AppSection({ title, children, footer }: PropsWithChildren<{ title?: string; footer?: string }>) {
  const { colors } = useAppTheme();
  return <View style={{ gap: 8 }}>
    {title ? <Text accessibilityRole="header" style={{ color: colors.secondaryText, fontSize: 13, paddingHorizontal: 16 }}>{title}</Text> : null}
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 16, gap: 12 }}>{children}</View>
    {footer ? <Text style={{ color: colors.secondaryText, fontSize: 13, lineHeight: 19, paddingHorizontal: 16 }}>{footer}</Text> : null}
  </View>;
}
