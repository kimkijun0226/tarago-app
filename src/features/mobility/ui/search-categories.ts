import { TRANSPORT_SYMBOLS } from '@/shared/ui/transport-icon';
/** @fileoverview 홈 검색과 결과 화면에서 공통으로 제공하는 추천 장소 카테고리. */

export const HOME_CATEGORIES = [
  {
    label: '음식점',
    color: '#ff8700',
    symbol: { ios: 'fork.knife', android: 'restaurant' },
  },
  {
    label: '카페',
    color: '#ff8700',
    symbol: { ios: 'cup.and.saucer.fill', android: 'local_cafe' },
  },
  {
    label: '편의점',
    color: '#eab900',
    symbol: { ios: 'basket.fill', android: 'shopping_basket' },
  },
  {
    label: '지하철역',
    color: '#2c73dd',
    symbol: TRANSPORT_SYMBOLS.subway,
  },
] as const;
