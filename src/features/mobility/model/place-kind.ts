import type { Place } from '../api/mobility';

/** 공급자의 장소 분류로 정류장과 일반 장소를 구분한다. */
export function isBusStopPlace(place: Place) {
  return /버스정류|버스정거/.test(place.category) || /버스정류장/.test(place.name);
}
export function stationSearchName(name: string) {
  return name.replace(/버스정류장/g, '').replace(/[\s()[\]·.,]/g, '');
}
