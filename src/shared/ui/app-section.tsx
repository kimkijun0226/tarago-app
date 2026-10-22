/** @fileoverview 제목·카드·하단 설명으로 설정 항목을 묶는 공통 레이아웃. */
import type { PropsWithChildren } from 'react';
import { Text, View } from 'react-native';
import { useAppTheme } from './theme';

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
    <View style={{ gap: 8 }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={{ color: colors.secondaryText, fontSize: 13, paddingHorizontal: 16 }}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.separator,
          padding: 18,
          gap: 12,
        }}
      >
        {children}
      </View>
      {footer ? (
        <Text
          style={{
            color: colors.secondaryText,
            fontSize: 13,
            lineHeight: 19,
            paddingHorizontal: 16,
          }}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
