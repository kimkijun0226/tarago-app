/** 지도 검색·시트에서 함께 사용하는 색상과 모서리 기준. */
export const mapTheme = {
  colors: {
    surface: '#FFFFFF',
    primary: '#1769E0',
    text: '#15171A',
    muted: '#69717C',
    divider: '#E9ECEF',
    handle: '#AEB4BC',
  },
  radius: { sheet: 24, search: 24, results: 18 },
} as const;
