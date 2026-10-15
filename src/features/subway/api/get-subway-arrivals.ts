/** @fileoverview 서버가 정규화한 역별 실시간 열차 도착정보의 계약과 조회 요청을 정의한다. */

import { apiClient } from '@/shared/api/client';

/** 서버 수신 시각과 남은 도착 초를 함께 제공하는 열차. etaSeconds가 null이면 안내 문구를 사용한다. */
export interface SubwayArrival {
  id: string;
  lineId: string;
  lineName: string;
  direction: string;
  destination: string;
  trainId: string;
  trainType: string;
  arrivalMessage: string;
  locationMessage: string;
  arrivalCode: string;
  receivedAt: string | null;
  etaSeconds: number | null;
  isLastTrain: boolean;
  stationId?: string;
  previousStationId?: string;
  nextStationId?: string;
  destinationDirection?: string;
}
/** fetchedAt은 목록 수집 시각이며 개별 열차의 receivedAt과 구분한다. */
export interface SubwayArrivals {
  stationName: string;
  fetchedAt: string;
  attribution: string;
  arrivals: SubwayArrival[];
}

/**
 * 공공 API 인증·정규화는 서버에 맡기고 실시간 도착정보를 읽는다.
 * @param stationName 조회할 역 이름.
 * @param signal Query의 요청 취소 신호.
 * @returns 수집 시각·출처와 열차 목록.
 */
export async function getSubwayArrivals(
  stationName: string,
  signal?: AbortSignal,
): Promise<SubwayArrivals> {
  /** HTTP 응답 래퍼에서 화면에 전달할 서버 본문만 꺼낸다. */
  const { data } = await apiClient.get<SubwayArrivals>('/subway/arrivals', {
    params: { stationName },
    signal,
  });
  return data;
}
