import {
  locationSchedule,
  validateSchedule,
  type AlertKind,
} from '@/features/bus-alert/model/alert-form';
import type { SubwayAlertDraft } from './use-subway-alert-screen';

/** 위치 알림은 지도에서 확인한 역 좌표와 반경을 요구한다. 기존 시간 알림은 이전 계약을 유지한다. */
export function buildSubwayAlertInput(draft: SubwayAlertDraft, kind: AlertKind, threshold: string) {
  const scheduledEnabled = draft.scheduledEnabled ?? kind === 'time';
  const proximityEnabled = draft.proximityEnabled ?? kind === 'location';
  if (!scheduledEnabled && !proximityEnabled) throw new Error('알림 방식을 선택해주세요.');
  if (
    !draft.days.length ||
    new Set(draft.days).size !== draft.days.length ||
    draft.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new Error('반복 요일을 선택해주세요.');
  const radius = draft.radius ?? 200;
  if (
    proximityEnabled &&
    (!Number.isFinite(draft.latitude) ||
      !Number.isFinite(draft.longitude) ||
      Math.abs(draft.latitude!) > 90 ||
      Math.abs(draft.longitude!) > 180 ||
      ![100, 200, 300, 500].includes(radius))
  )
    throw new Error('지도에서 역과 접근 반경을 선택해주세요.');
  const repeatMinutes = draft.repeatMinutes ?? 5;
  if (proximityEnabled && ![1, 3, 5, 10].includes(repeatMinutes))
    throw new Error('재알림 간격을 선택해주세요.');
  const schedule = scheduledEnabled
    ? validateSchedule(draft, threshold, draft.notificationStages)
    : locationSchedule(draft);
  return {
    ...draft,
    ...schedule,
    scheduledEnabled,
    proximityEnabled,
    radius,
    ...(proximityEnabled ? { repeatMinutes } : {}),
  };
}
