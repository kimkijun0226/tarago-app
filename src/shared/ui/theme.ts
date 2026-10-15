/** @fileoverview 앱 공통 색상·간격·글자·모서리 토큰. 컴포넌트나 서버 상태는 관리하지 않는다. */
/** 기기 모드와 무관하게 앱이 사용하는 공통 라이트 색상표다. */
const palettes = {
  light: {
    background: '#F2F2F7',
    surface: '#FFFFFF',
    secondarySurface: '#E5E5EA',
    text: '#1C1C1E',
    secondaryText: '#636366',
    tertiaryText: '#8E8E93',
    separator: '#D1D1D6',
    accent: '#007AFF',
    accentSurface: '#EAF3FF',
    onAccent: '#FFFFFF',
    danger: '#FF3B30',
    warning: '#8A5900',
    warningSurface: '#FFF4D6',
    success: '#248A3D',
  },
};

/** 작은 여백부터 큰 여백까지 재사용하는 논리 픽셀 간격 토큰이다. */
const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

/** 버튼·카드·시트 모서리 크기를 통일하는 토큰이다. */
const radius = { sm: 8, md: 12, lg: 16, sheet: 24 };

/** 제목·본문·설명의 글자 크기와 두께를 통일하는 텍스트 토큰이다. */
const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.3 },
  title: { fontSize: 22, fontWeight: '700' as const },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 17, lineHeight: 24 },
  footnote: { fontSize: 13, lineHeight: 19 },
};

/**
 * 지도·알림에서 공통으로 사용하는 밝은 테마를 반환한다.
 * 고정 토큰은 모듈 범위에 있어 렌더마다 다시 생성되지 않는다.
 * 이 함수는 React 훅을 호출하지 않으며 useMemo로 추가 캐시할 계산도 없다.
 * @returns 색상, 간격, 모서리, 글자 스타일과 고정된 라이트 모드 여부.
 */
export function useAppTheme() {
  /** 현재 공통 테마가 항상 라이트임을 알리는 고정 반환값이다. */
  const isDark = false;
  return { colors: palettes.light, spacing, radius, type, isDark };
}
