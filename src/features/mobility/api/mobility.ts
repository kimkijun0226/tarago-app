/** @fileoverview 장소 검색의 서버 계약과 요청 함수를 정의한다. UI와 위치 권한 처리는 호출자가 담당한다. */

import { apiClient } from '@/shared/api/client';
import type { Point } from '@/shared/types/geo';
export type { Point } from '@/shared/types/geo';
/** 검색 장소. entrance는 공급자가 제공한 실제 출입구 좌표다. */
export type Place = Point & {
  entrance?: Point;
  /** 공식 역 검색에서 선택한 호선을 유지한다. */
  subwayLineName?: string;
  id: string;
  name: string;
  address: string;
  category: string;
  distanceMeters: number | null;
};
/**
 * 주변 좌표를 기준으로 장소를 검색한다. 외부 서비스 키는 서버에만 둔다.
 * @param q 검색어.
 * @param near 검색 중심 좌표.
 * @param signal Query가 전달하는 요청 취소 신호.
 * @returns 서버가 정규화한 장소 목록.
 */
export async function searchPlaces(q: string, near: Point, signal?: AbortSignal): Promise<Place[]> {
  return (await apiClient.get<Place[]>('/mobility/places', { params: { q, ...near }, signal }))
    .data;
}
