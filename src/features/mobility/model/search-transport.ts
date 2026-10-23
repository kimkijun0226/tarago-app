import type { Place } from '../api/mobility';
import { isBusStopPlace, isSubwayPlace } from './place-kind';

/** 목록과 지도에서 같은 종류·색으로 교통수단을 구분한다. */
export function searchTransport(place: Place) {
  if (place.id.startsWith('station:') || isBusStopPlace(place))
    return { kind: 'bus' as const, label: '버스 정류소', color: '#00A878' };
  if (/출(?:입)?구/.test(`${place.name} ${place.category}`) && /역|지하철|전철/.test(`${place.name} ${place.category}`))
    return { kind: 'exit' as const, label: '지하철 출구', color: '#9366D7' };
  if (place.id.startsWith('subway:') || isSubwayPlace(place))
    return { kind: 'subway' as const, label: '지하철역', color: '#3478F6' };
  return { kind: 'place' as const, label: '장소', color: '#818894' };
}
