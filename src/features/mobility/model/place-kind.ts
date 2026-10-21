/** @fileoverview 검색 공급자의 분류와 명칭을 지도에서 사용할 장소 종류·정류장 비교 이름으로 해석한다. */

import type { Place } from '../api/mobility';

/**
 * 장소 분류 또는 이름으로 버스정류장 여부를 판별한다.
 * @param place 공급자가 반환한 검색 장소.
 * @returns 지도 정류장 조회로 연결할 장소인지 여부.
 */
export function isBusStopPlace(place: Place) {
  return /버스정류|버스정거/.test(place.category) || /버스정류장/.test(place.name);
}

/**
 * 공급자별 표기 차이를 줄여 검색 장소와 실제 정류장 이름을 비교한다.
 * @param name 원본 정류장 이름.
 * @returns 버스정류장 접미사·공백·구분 기호를 제거한 비교용 이름.
 */
export function stationSearchName(name: string) {
  return name.replace(/버스정류장/g, '').replace(/[\s()[\]·.,]/g, '');
}

/**
 * 공급자 분류와 역 이름으로 실시간 지하철 버튼을 표시할지 판단한다.
 * @param place 선택 장소.
 * @returns 지하철역으로 해석할 수 있는지 여부.
 */
export function isSubwayPlace(place: Place) {
  return /지하철|전철|도시철도/.test(place.category) || /역(?:\s|$)/.test(place.name);
}

export type SearchResultFilter = 'all' | 'place' | 'stop' | 'subway';

/** 목록과 지도에 같은 장소 분류를 적용한다. */
export function matchesSearchFilter(place: Place, filter: SearchResultFilter) {
  return filter === 'all' || (filter === 'stop' ? isBusStopPlace(place)
    : filter === 'subway' ? isSubwayPlace(place) : !isBusStopPlace(place) && !isSubwayPlace(place));
}
