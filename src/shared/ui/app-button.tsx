/** @fileoverview 로딩·비활성·강조 상태를 일관되게 표시하는 공통 터치 버튼. */
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { useAppTheme } from './theme';

/**
 * 버튼의 동작은 호출자에게 맡기고 시각 상태와 접근성 속성만 제공한다.
 * 전경색 선택은 문자열 비교 두 번뿐이라 useMemo가 필요 없다.
 * @param props 표시 제목, 누름 이벤트, 로딩·비활성 여부와 시각 변형.
 */
export function AppButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'destructive';
}) {
  /** 버튼 변형과 상태에 적용할 공통 팔레트다. */
  const { colors } = useAppTheme();

  /** 강조·삭제·보조 변형에 따라 텍스트와 로딩 표시기에 적용할 전경색이다. */
  const foreground =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'destructive'
        ? colors.danger
        : colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50,
        borderRadius: 12,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: variant === 'primary' ? colors.accent : colors.secondarySurface,
        opacity: disabled || loading ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text style={{ color: foreground, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
