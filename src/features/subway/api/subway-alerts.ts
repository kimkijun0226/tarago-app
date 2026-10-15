/** @fileoverview 기기 인증을 붙여 지하철 도착 알림 예약을 조회·생성·수정·삭제한다. */

import { apiClient } from '@/shared/api/client';
import { alertAuth } from '@/features/bus-alert/api/alerts';
import type { SubwayAlert, SubwayAlertInput } from '../model/subway-alert';

/**
 * 버스 알림과 동일한 기기 자격 증명으로 예약 목록을 조회한다.
 * @param signal Query의 요청 취소 신호.
 * @returns 이 기기에 속한 지하철 알림 목록.
 */
export async function getSubwayAlerts(signal?: AbortSignal): Promise<SubwayAlert[]> {
  /** HTTP 응답 래퍼에서 화면에 전달할 서버 본문만 꺼낸다. */
  const { data } = await apiClient.get<SubwayAlert[]>('/subway/alerts', {
    ...(await alertAuth()),
    signal,
  });
  return data;
}

/**
 * 기기 인증을 사용하여 예약을 생성하거나 기존 예약을 갱신한다.
 * @param input 역·방향·반복 시간·알림 단계 설정.
 * @param id 수정할 예약 ID. 생략하면 새로 생성한다.
 * @returns 서버가 저장한 예약.
 */
export async function saveSubwayAlert(input: SubwayAlertInput, id?: string): Promise<SubwayAlert> {
  /** 버스 알림과 공유하는 기기 인증 헤더를 저장 요청 전에 준비한다. */
  const config = await alertAuth();

  /** HTTP 응답 래퍼에서 화면에 전달할 서버 본문만 꺼낸다. */
  const { data } = id
    ? await apiClient.put<SubwayAlert>(`/subway/alerts/${id}`, input, config)
    : await apiClient.post<SubwayAlert>('/subway/alerts', input, config);
  return data;
}

/**
 * 기기 소유 예약을 삭제한다.
 * @param id 삭제할 예약 ID.
 * @returns 삭제 완료 Promise. 오류는 호출자가 표시한다.
 */
export async function deleteSubwayAlert(id: string) {
  await apiClient.delete(`/subway/alerts/${id}`, await alertAuth());
}
