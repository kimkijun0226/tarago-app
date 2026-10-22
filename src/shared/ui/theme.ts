/** @fileoverview 앱 공통 색상·간격·글자·모서리 토큰. 컴포넌트나 서버 상태는 관리하지 않는다. */
/** Airbnb의 흰 표면·Rausch 코랄을 공유한다. 작은 글자와 흰 CTA 글자는 대비를 확보한 코랄을 쓴다. */
export const appColors = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  secondarySurface: '#F7F7F7',
  strongSurface: '#F2F2F2',
  text: '#222222',
  bodyText: '#3F3F3F',
  secondaryText: '#6A6A6A',
  tertiaryText: '#929292',
  separator: '#EBEBEB',
  borderStrong: '#DDDDDD',
  brand: '#FF385C',
  accent: '#D92850',
  accentActive: '#E00B41',
  accentSurface: '#FFF7F8',
  accentBorder: '#FFD1DA',
  onAccent: '#FFFFFF',
  danger: '#C13515',
  warning: '#855000',
  warningSurface: '#FFF7E8',
  success: '#24735C',
  luxe: '#460479',
  plus: '#92174D',
  legalLink: '#428BFF',
};

/** 작은 여백부터 큰 여백까지 재사용하는 논리 픽셀 간격 토큰이다. */
const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };

/** 버튼·카드·시트 모서리 크기를 통일하는 토큰이다. */
const radius = { sm: 12, md: 16, lg: 20, sheet: 28 };

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
  return { colors: appColors, spacing, radius, type, isDark };
}
