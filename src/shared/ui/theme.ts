/** @fileoverview 앱 공통 색상·간격·글자·모서리 토큰. 컴포넌트나 서버 상태는 관리하지 않는다. */
/** 확정된 교통 말풍선 심볼의 맑은 파랑과 흰 표면을 공유한다. */
export const appColors = {
  background: '#F6F8FC',
  surface: '#FFFFFF',
  secondarySurface: '#F3F7FD',
  strongSurface: '#E8F0FC',
  text: '#1B2D48',
  bodyText: '#465873',
  secondaryText: '#586B86',
  tertiaryText: '#64758D',
  separator: '#E3EAF4',
  borderStrong: '#D1DEEF',
  brand: '#3385F5',
  accent: '#2468D4',
  accentActive: '#1E56B3',
  accentSurface: '#ECF4FF',
  accentBorder: '#A9C9F5',
  onAccent: '#FFFFFF',
  highlight: '#3385F5',
  highlightSurface: '#ECF4FF',
  danger: '#A34842',
  warning: '#805F24',
  warningSurface: '#FFF7DB',
  success: '#2468D4',
  luxe: '#465873',
  plus: '#586B86',
  legalLink: '#465873',
};

/** 작은 여백부터 큰 여백까지 재사용하는 논리 픽셀 간격 토큰이다. */
export const appSpacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

/** 버튼·카드·시트 모서리 크기를 통일하는 토큰이다. */
export const appRadius = { sm: 8, md: 14, lg: 16, sheet: 16 };

/** 지도 위에 떠 있는 표면에만 적용하는 얕은 그림자. */
export const appShadows = { floating: '0px 3px 12px rgba(27, 45, 72, 0.07)' };
const radius = appRadius;

/** 제목·본문·설명의 글자 크기와 두께를 통일하는 텍스트 토큰이다. */
export const appType = {
  largeTitle: { fontSize: 28, fontWeight: '600' as const, letterSpacing: -0.6 },
  title: { fontSize: 21, fontWeight: '600' as const },
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
  return { colors: appColors, spacing: appSpacing, radius, type: appType, isDark };
}
