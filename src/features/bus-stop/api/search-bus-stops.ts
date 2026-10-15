/** @fileoverview 서버에 저장된 정류장 이름·번호 검색. 외부 공공 API를 직접 호출하지 않는다. */
import { apiClient } from '@/shared/api/client';
import type { Point } from '@/shared/types/geo';
import type { BusStop } from './get-nearby-bus-stops';

/** 장소 검색과 구분된 Query에서 정류장 검색 결과를 캐시하도록 원본 서버 응답을 반환한다. */
export async function searchBusStops(
  q: string,
  position: Point,
  signal?: AbortSignal,
): Promise<BusStop[]> {
  return (
    await apiClient.get<BusStop[]>('/bus/stations/search', { params: { q, ...position }, signal })
  ).data;
}
