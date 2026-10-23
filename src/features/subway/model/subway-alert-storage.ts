/** @fileoverview React 외부의 위치 감지 작업이 읽는 마지막 지하철 알림 사본이다. */
import { API_STORAGE_SCOPE } from '@/shared/api/config';
import { alertStorage } from '@/features/bus-alert/model/alert-storage';
import type { SubwayAlert } from './subway-alert';

export async function cacheSubwayAlerts(alerts: SubwayAlert[]) {
  await alertStorage.setItem(`tarago-subway-alerts-${API_STORAGE_SCOPE}`, JSON.stringify(alerts));
}

export async function readCachedSubwayAlerts(): Promise<SubwayAlert[]> {
  const value = await alertStorage.getItem(`tarago-subway-alerts-${API_STORAGE_SCOPE}`);
  return value ? JSON.parse(value) : [];
}
