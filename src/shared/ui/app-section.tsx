/** @fileoverview 제목·카드·하단 설명으로 설정 항목을 묶는 공통 레이아웃. */
import type { PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme, appSpacing, appRadius, appType } from './theme';

/**
 * 전달받은 설정 UI를 같은 여백과 배경으로 묶는다. 데이터 조회나 상태 변경은 하지 않는다.
 * 조건부 텍스트 표시만 수행하므로 useRef·useMemo를 추가하지 않는다.
 * @param props 섹션 제목, 내부 내용과 선택적인 하단 설명.
 */
export function AppSection({
  title,
  children,
  footer,
}: PropsWithChildren<{ title?: string; footer?: string }>) {
  /** 섹션 제목·카드 배경·설명에 적용할 공통 팔레트다. */
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: appSpacing.sm }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontSize: 15, fontWeight: '600', paddingHorizontal: 0 }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: appRadius.lg,
          borderWidth: 1,
          borderColor: colors.separator,
          padding: appSpacing.lg,
          gap: appSpacing.md,
        }}
      >
        {children}
      </View>
      {footer ? (
        <Text
          style={{
            color: colors.secondaryText,
            ...appType.footnote,
            paddingHorizontal: 0,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
