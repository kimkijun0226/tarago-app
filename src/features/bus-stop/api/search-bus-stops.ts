import { apiClient } from '@/shared/api/client';
import type { Coordinate } from '@/hooks/use-current-location';
import type { BusStop } from './get-nearby-bus-stops';

/** 목적지 정류장 검색의 요청 취소·캐시는 호출한 Query가 관리한다. */
export async function searchBusStops(query:string,position:Coordinate,signal?:AbortSignal):Promise<BusStop[]> {
  const {data}=await apiClient.get<BusStop[]>('/bus/stations/search',{
    params:{q:query,latitude:position.latitude,longitude:position.longitude},signal,
  });
  return data;
}
