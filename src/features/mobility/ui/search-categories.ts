import { TRANSPORT_SYMBOLS } from '@/shared/ui/transport-icon';
/** @fileoverview 홈 검색과 결과 화면에서 공통으로 제공하는 추천 장소 카테고리. */

export const HOME_CATEGORIES = [
  {
    label: '음식점',
    color: '#525252',
    symbol: { ios: 'fork.knife', android: 'restaurant' },
  },
  {
    label: '카페',
    color: '#525252',
    symbol: { ios: 'cup.and.saucer.fill', android: 'local_cafe' },
  },
  {
    label: '편의점',
    color: '#525252',
    symbol: { ios: 'basket.fill', android: 'shopping_basket' },
  },
  {
    label: '지하철역',
    color: '#525252',
    symbol: TRANSPORT_SYMBOLS.subway,
  },
] as const;
