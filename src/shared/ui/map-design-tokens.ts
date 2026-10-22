/** @fileoverview 지도 검색·선택 패널·도착 시트가 공유하는 밝은 Airbnb 색상과 규격. */
import { appColors } from './theme';

/** blue/blueSurface는 기존 호출부의 이름을 유지하되 앱의 코랄 강조색으로 연결한다. */
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
  separator: appColors.secondarySurface,
  horizontalInset: 16,
  chipHeight: 44,
  searchHeight: 54,
} as const;
