import type { AlertDraft, AlertKind } from './alert-form';
import type { SubwayAlertDraft } from '@/features/subway/model/use-subway-alert-screen';

export type AlertRouteParams = {
  alertTransport?: string;
  alertKind?: string;
  stationId?: string;
  stationName?: string;
  latitude?: string;
  longitude?: string;
  routeId?: string;
  busNumber?: string;
  stationSeq?: string;
  requestId?: string;
  alertId?: string;
  sourceAlertId?: string;
  sourceAlertIds?: string;
  monitoringId?: string;
  lineId?: string;
  lineName?: string;
  direction?: string;
  destination?: string;
  nextStationName?: string;
  destinationNames?: string;
};
/** 표시 후보와 감시 대상을 제한하는 destination 필터를 구분한다. */
function routeDestinationNames(value?: string): string[] | undefined {
  if (!value) return undefined;
  try {
    const names: unknown = JSON.parse(value);
    return Array.isArray(names) &&
      names.length > 0 &&
      names.length <= 12 &&
      names.every((n) => typeof n === 'string' && n.trim().length > 0 && n.length <= 100)
      ? [...new Set(names as string[])]
      : undefined;
  } catch {
    return undefined;
  }
}

export const routeKind = (value?: string): AlertKind | undefined =>
  value === 'time' || value === 'location' ? value : undefined;
function coordinates(params: AlertRouteParams) {
  const latitude = Number(params.latitude),
    longitude = Number(params.longitude);
  return params.latitude?.trim() &&
    params.longitude?.trim() &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
    ? { latitude, longitude }
    : null;
}
function schedule(params: AlertRouteParams, openedAt: number) {
  const requested = Number(params.requestId);
  const now = Number.isFinite(requested) && requested > 0 ? requested : openedAt;
  return {
    days: [1, 2, 3, 4, 5],
    startTime: new Date(now + 9 * 3600_000).toISOString().slice(11, 16),
    endTime: new Date(now + 11 * 3600_000).toISOString().slice(11, 16),
    thresholdMinutes: 5,
    notificationStages: [5, 3, 2, 1, 0],
    enabled: true,
  };
}
export function busDraftFromRoute(params: AlertRouteParams, openedAt: number): AlertDraft | null {
  const point = coordinates(params);
  if (
    params.alertId ||
    !params.requestId ||
    !params.stationId ||
    !params.routeId ||
    !point ||
    params.alertTransport === 'subway'
  )
    return null;
  const kind = routeKind(params.alertKind) ?? 'time';
  const stationSeq = Number(params.stationSeq);
  return {
    ...schedule(params, openedAt),
    stationId: params.stationId,
    routeId: params.routeId,
    busNumber: params.busNumber ?? params.routeId,
    ...(Number.isInteger(stationSeq) && stationSeq > 0 ? { stationSeq } : {}),
    stop: { id: params.stationId, name: params.stationName ?? '정류소', ...point },
    scheduledEnabled: kind === 'time',
    proximityEnabled: kind === 'location',
    radius: 200,
    showVehicleNumber: true,
  };
}
export function subwayDraftFromRoute(
  params: AlertRouteParams,
  openedAt: number,
): SubwayAlertDraft | null {
  if (
    params.alertId ||
    !params.requestId ||
    !params.stationName ||
    !params.lineId ||
    !params.direction ||
    params.alertTransport !== 'subway'
  )
    return null;
  const kind = routeKind(params.alertKind) ?? 'time';
  const point = coordinates(params);
  if (kind === 'location' && !point) return null;
  return {
    ...schedule(params, openedAt),
    stationName: params.stationName,
    lineId: params.lineId,
    lineName: params.lineName,
    direction: params.direction,
    ...(params.nextStationName?.trim() ? { nextStationName: params.nextStationName.trim() } : {}),
    ...(routeDestinationNames(params.destinationNames)
      ? { destinationNames: routeDestinationNames(params.destinationNames) }
      : {}),
    ...(params.destination ? { destination: params.destination } : {}),
    ...(point ?? {}),
    scheduledEnabled: kind === 'time',
    proximityEnabled: kind === 'location',
    radius: 200,
  };
}
