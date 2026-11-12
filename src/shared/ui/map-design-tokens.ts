/** @fileoverview 지도 검색·선택 패널·도착 시트가 공유하는 공통 색상과 규격. */
import { appColors, appSpacing } from './theme';

/** blue/blueSurface는 기존 호출부의 이름을 유지하되 앱의 파란 강조색으로 연결한다. */
export const mapUi = {
  background: appColors.surface,
  text: appColors.text,
  secondaryText: appColors.secondaryText,
  blue: appColors.accent,
  blueSurface: appColors.accentSurface,
  brand: appColors.brand,
  accentBorder: appColors.accentBorder,
  strongSurface: appColors.strongSurface,
  green: appColors.success,
  border: appColors.borderStrong,
  separator: appColors.separator,
  horizontalInset: appSpacing.lg,
  chipHeight: 44,
  searchHeight: 44,
} as const;
