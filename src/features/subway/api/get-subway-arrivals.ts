import { apiClient } from '@/shared/api/client';

export interface SubwayArrival {
  id: string; lineId: string; lineName: string; direction: string; destination: string;
  trainId: string; trainType: string; arrivalMessage: string; locationMessage: string;
  arrivalCode: string; receivedAt: string | null; etaSeconds: number | null; isLastTrain: boolean;
}
export interface SubwayArrivals {
  stationName: string; fetchedAt: string; attribution: string; arrivals: SubwayArrival[];
}

/** 공공 API 인증키와 응답 정규화는 서버가 담당한다. */
export async function getSubwayArrivals(stationName: string, signal?: AbortSignal): Promise<SubwayArrivals> {
  const { data } = await apiClient.get<SubwayArrivals>('/subway/arrivals', { params: { stationName }, signal });
  return data;
}
