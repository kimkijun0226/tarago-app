/** @fileoverview 역 알림마다 반경을 따로 등록하고 진입·이탈을 서버 반복 알림에 연결한다. */
import type { SubwayAlert } from './subway-alert';
import { readCachedSubwayAlerts } from './subway-alert-storage';
import { reportProximity } from '@/features/bus-alert/model/proximity-visits';

export const subwayRegionId = (alert: SubwayAlert) => `subway:${alert.id}`;

export function subwayProximityRegions(alerts: SubwayAlert[]) {
  return alerts
    .filter(
      (a) =>
        a.enabled &&
        a.proximityEnabled &&
        !a.monitoringSourceId &&
        Number.isFinite(a.latitude) &&
        Number.isFinite(a.longitude),
    )
    .map((a) => ({
      identifier: subwayRegionId(a),
      latitude: a.latitude!,
      longitude: a.longitude!,
      radius: a.radius ?? 200,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
}

export async function handleSubwayExit(identifier: string, observedAt = Date.now()) {
  await reportProximity('subway', identifier.slice('subway:'.length), false, false, observedAt);
}

export async function handleSubwayEntry(
  identifier: string,
  force = false,
  observedAt = Date.now(),
) {
  const id = identifier.slice('subway:'.length);
  const alert = (await readCachedSubwayAlerts()).find((a) => a.id === id);
  if (!alert) return;
  // 요일 판정은 서버가 반복 발송마다 수행한다. 경계 이벤트는 실제 안팎 상태만 전달한다.
  await reportProximity(
    'subway',
    id,
    Boolean(alert.enabled && alert.proximityEnabled),
    force,
    observedAt,
  );
}
