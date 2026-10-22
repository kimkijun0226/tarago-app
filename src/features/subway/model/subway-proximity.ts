/** @fileoverview 지하철 접근 영역과 중복 방지 상태를 공통 위치 작업에 연결한다. */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { alertStorage } from '@/features/bus-alert/model/alert-storage';
import { shouldNotifyVisit } from '@/features/bus-alert/model/bus-alert';
import { subwayAlertSubtitle } from './subway-direction';
import type { SubwayAlert } from './subway-alert';
import { readCachedSubwayAlerts } from './subway-alert-storage';

const pending = new Set<string>();
export const subwayRegionId = (alert: SubwayAlert) => `subway:${alert.stationName}`;

/** 같은 역은 한 영역으로 합쳐 버스와 공유하는 OS 영역 한도에 포함한다. */
export function subwayProximityRegions(alerts: SubwayAlert[]) {
  const regions = new Map<
    string,
    {
      identifier: string;
      latitude: number;
      longitude: number;
      radius: number;
      notifyOnEnter: boolean;
      notifyOnExit: boolean;
    }
  >();
  for (const alert of alerts) {
    if (
      !alert.enabled ||
      !alert.proximityEnabled ||
      !Number.isFinite(alert.latitude) ||
      !Number.isFinite(alert.longitude)
    )
      continue;
    const identifier = subwayRegionId(alert);
    regions.set(identifier, {
      identifier,
      latitude: alert.latitude!,
      longitude: alert.longitude!,
      radius: Math.max(regions.get(identifier)?.radius ?? 0, alert.radius ?? 200),
      notifyOnEnter: true,
      notifyOnExit: true,
    });
  }
  return [...regions.values()];
}

export async function handleSubwayExit(identifier: string) {
  const key = `visit:${identifier}`;
  const state = JSON.parse((await alertStorage.getItem(key)) ?? '{}');
  await alertStorage.setItem(key, JSON.stringify({ ...state, inside: false }));
}

/** 요일과 최신 활성 설정을 확인한 뒤 사용자 동의가 필요한 감시 제안을 보낸다. */
export async function handleSubwayEntry(identifier: string) {
  if (pending.has(identifier)) return;
  pending.add(identifier);
  try {
    const day = new Date(Date.now() + 9 * 60 * 60_000).getUTCDay();
    const alerts = await readCachedSubwayAlerts();
    const sources = alerts.filter(
      (a) =>
        subwayRegionId(a) === identifier &&
        a.enabled &&
        a.proximityEnabled &&
        a.days.includes(day) &&
        !alerts.some(
          (session) =>
            session.monitoringSourceId === a.id &&
            session.enabled &&
            Date.parse(session.monitoringEndsAt ?? '') > Date.now(),
        ),
    );
    if (!sources.length) return;
    const key = `visit:${identifier}`;
    const state = JSON.parse((await alertStorage.getItem(key)) ?? '{}');
    if (!shouldNotifyVisit(state, Date.now())) return;
    const latest = await readCachedSubwayAlerts();
    const valid = sources.filter((source) =>
      latest.some(
        (a) => a.id === source.id && a.enabled && a.proximityEnabled && a.days.includes(day),
      ),
    );
    if (!valid.length) return;
    await Notifications.scheduleNotificationAsync({
      identifier: `proximity:${identifier}`,
      content: {
        title: `${valid[0].stationName}역 근처입니다`,
        body: `${valid.map(subwayAlertSubtitle).join(' · ')}\n실시간 도착 알림을 1시간 동안 시작할까요?`,
        categoryIdentifier: 'TARAGO_PROXIMITY',
        sound: 'default',
        data: {
          kind: 'subway-proximity-prompt',
          promptId: String(Date.now()),
          alertId: valid[0].id,
          alertIds: valid.map((a) => a.id),
          stationName: valid[0].stationName,
        },
      },
      trigger: Platform.OS === 'android' ? { channelId: 'subway-arrivals' } : null,
    });
    await alertStorage.setItem(key, JSON.stringify({ inside: true, lastSent: Date.now() }));
  } finally {
    pending.delete(identifier);
  }
}
