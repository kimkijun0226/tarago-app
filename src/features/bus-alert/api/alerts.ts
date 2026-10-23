/** @fileoverview 기기 자격 증명을 보안 저장소에서 얻어 버스·지하철 공용 인증과 버스 알림 HTTP 요청을 제공한다. */
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '@/shared/api/client';
import type { BusAlert, BusAlertInput } from '../model/bus-alert';

/** 동시 요청이 기기를 중복 등록하지 않도록 진행 중인 자격 증명 획득 Promise만 공유한다. */
let registration: Promise<string> | undefined;

/** 서버의 무작위 기기 자격 증명은 화면·로그가 아닌 OS 보안 저장소에 보관한다. */
async function credential() {
  if (registration) return registration;
  registration = (async () => {
    /** 보안 저장소에 이미 발급된 기기 자격 증명이 있는지 확인한다. */
    const existing = await SecureStore.getItemAsync('tarago-alert-credential');
    if (existing) return existing;

    /** 인증한 기기의 서버 응답 본문이며 호출자에게 필요한 데이터만 반환한다. */
    const { data } = await apiClient.post<{ credential: string }>('/alerts/devices');
    await SecureStore.setItemAsync('tarago-alert-credential', data.credential, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    return data.credential;
  })();
  try {
    return await registration;
  } finally {
    registration = undefined;
  }
}

/** 버스·지하철 알림 API가 같은 기기 소유권 인증을 사용한다. */
export async function alertAuth() {
  return { headers: { Authorization: `Bearer ${await credential()}` } };
}

/** 현재 기기에 속한 알림 목록을 조회한다. signal로 종료된 쿼리의 요청을 취소할 수 있다. */
export async function getAlerts(signal?: AbortSignal): Promise<BusAlert[]> {
  /** 인증한 기기의 서버 응답 본문이며 호출자에게 필요한 데이터만 반환한다. */
  const { data } = await apiClient.get<BusAlert[]>('/alerts', { ...(await alertAuth()), signal });
  return data;
}

/** 서버에 등록된 현재 기기의 푸시 준비 상태와 오류를 조회한다. */
export async function getPushStatus(): Promise<{ ready: boolean; error: string | null }> {
  /** 인증한 기기의 서버 응답 본문이며 호출자에게 필요한 데이터만 반환한다. */
  const { data } = await apiClient.get<{ ready: boolean; error: string | null }>(
    '/alerts/devices/status',
    await alertAuth(),
  );
  return data;
}

/** 발급받은 Expo 푸시 토큰을 현재 기기에 연결한다. */
export async function registerPushToken(token: string) {
  await apiClient.put('/alerts/devices/push-token', { token }, await alertAuth());
}

/** ID가 있으면 기존 알림을 갱신하고 없으면 생성하여 서버의 최종 레코드를 반환한다. */
export async function saveAlert(input: BusAlertInput, id?: string): Promise<BusAlert> {
  /** 생성·수정 요청에 동일한 기기 소유권 인증 헤더를 제공한다. */
  const config = await alertAuth();

  /** 인증한 기기의 서버 응답 본문이며 호출자에게 필요한 데이터만 반환한다. */
  const { data } = id
    ? await apiClient.put<BusAlert>(`/alerts/${id}`, input, config)
    : await apiClient.post<BusAlert>('/alerts', input, config);
  return data;
}

/** 기기 소유권 인증을 포함해 해당 알림을 삭제한다. */
export async function deleteAlert(id: string) {
  await apiClient.delete(`/alerts/${id}`, await alertAuth());
}

/** 알림별 실제 영역 진입·이탈을 전달한다. 서버는 진입 중에만 반복 푸시를 발송한다. */
export async function setAlertProximity(
  transport: 'bus' | 'subway',
  id: string,
  visit: { inside: boolean; observedAt: string },
) {
  const path = transport === 'bus' ? '/alerts' : '/subway/alerts';
  await apiClient.put(`${path}/${id}/proximity`, visit, await alertAuth());
}

export type NotificationHistoryItem = {
  id: string;
  transport: 'bus' | 'subway';
  alertId: string | null;
  title: string;
  body: string;
  sentAt: string;
  kind: 'time' | 'location';
};
/** 기기 소유권 인증으로 발송 당시의 제목·본문과 시각을 조회한다. */
export async function getNotificationHistory(cursor?: string, signal?: AbortSignal) {
  const { data } = await apiClient.get<{
    items: NotificationHistoryItem[];
    nextCursor: string | null;
  }>('/alerts/history', {
    ...(await alertAuth()),
    params: cursor ? { cursor } : undefined,
    signal,
  });
  return data;
}
