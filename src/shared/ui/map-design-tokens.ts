/** @fileoverview 지도 검색·길찾기·지하철 시트가 공유하는 고정 시각 토큰. 앱 공통 테마 위에 지도 화면 전용 색상·규격을 정의한다. */
/** 검색·길찾기·역 상세 화면에서 기준 이미지의 색과 간격을 공유한다. */
export const mapUi = {
  background: '#FFFFFF',
  text: '#202124',
  secondaryText: '#85888B',
  blue: '#0068FF',
  blueSurface: '#E8F1FF',
  green: '#00C75A',
  border: '#E3E5E7',
  separator: '#F0F1F2',
  horizontalInset: 16,
  chipHeight: 40,
  searchHeight: 50,
} as const;
