import { apiClient } from '@/shared/api/client';
import { alertAuth } from '@/features/bus-alert/api/alerts';
import type { SubwayAlert, SubwayAlertInput } from '../model/subway-alert';

/** 버스 알림과 같은 기기 자격 증명으로 예약 지하철 알림을 관리한다. */
export async function getSubwayAlerts(signal?: AbortSignal): Promise<SubwayAlert[]> {
  const { data } = await apiClient.get<SubwayAlert[]>('/subway/alerts', { ...await alertAuth(), signal });
  return data;
}
export async function saveSubwayAlert(input: SubwayAlertInput, id?: string): Promise<SubwayAlert> {
  const config = await alertAuth();
  const { data } = id ? await apiClient.put<SubwayAlert>(`/subway/alerts/${id}`, input, config)
    : await apiClient.post<SubwayAlert>('/subway/alerts', input, config);
  return data;
}
export async function deleteSubwayAlert(id: string) {
  await apiClient.delete(`/subway/alerts/${id}`, await alertAuth());
}
