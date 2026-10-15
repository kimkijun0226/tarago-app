/** @fileoverview 최근 선택한 장소 최대 10개를 기기 저장소에 보관하고 손상된 JSON을 복구 가능한 빈 목록으로 처리한다. */

import Storage from 'expo-sqlite/kv-store';
import type { Place } from '../api/mobility';

/** 최근 장소 목록을 다른 기기 설정과 구분하는 영구 저장소 키다. */
const KEY = 'tarago-recent-places';

/**
 * 최근 장소를 읽고 필수 필드가 없는 항목을 제외한다. JSON 손상은 검색을 막지 않는다.
 * @returns 저장 순서를 유지한 최대 10개 장소. 저장소 접근 오류는 호출자가 처리한다.
 */
export async function readPlaceHistory(): Promise<Place[]> {
  /** 저장소에서 읽은 원본 JSON 문자열이다. 값이 없으면 최근 장소도 없다. */
  const raw = await Storage.getItem(KEY);
  if (!raw) return [];
  try {
    /** 역직렬화 결과를 unknown으로 받아 장소 필드와 좌표를 확인한 뒤 사용한다. */
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data)
      ? data
          .filter(
            (p): p is Place =>
              p &&
              typeof p.id === 'string' &&
              typeof p.name === 'string' &&
              typeof p.address === 'string' &&
              Number.isFinite(p.latitude) &&
              Number.isFinite(p.longitude),
          )
          .slice(0, 10)
      : [];
  } catch (error) {
    console.warn('최근 장소 캐시 해석 실패', error instanceof Error ? error.name : 'unknown');
    return [];
  }
}

/**
 * 부모가 정한 최근 순서를 유지해 최대 10개 장소를 저장한다.
 * @param places 최신 선택 장소부터 정렬한 목록.
 * @returns 저장 완료 시 이행되는 Promise. 저장소 오류는 호출자에게 전달한다.
 */
export async function savePlaceHistory(places: Place[]) {
  await Storage.setItem(KEY, JSON.stringify(places.slice(0, 10)));
}
