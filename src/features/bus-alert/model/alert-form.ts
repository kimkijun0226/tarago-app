import type { AlertStop, BusAlertInput } from './bus-alert';

export type AlertKind = 'time' | 'location';

/** 단일 방식 알림은 저장된 종류를 우선하고 복합 설정만 현재 목록 선택을 따른다. */
export function resolveAlertKind(
  settings: { scheduledEnabled?: boolean; proximityEnabled?: boolean } | null | undefined,
  fallback: AlertKind = 'time',
): AlertKind {
  if (!settings) return fallback;
  if (settings.proximityEnabled && settings.scheduledEnabled === false) return 'location';
  if (settings.scheduledEnabled !== false && !settings.proximityEnabled) return 'time';
  return fallback;
}

export type AlertDraft = BusAlertInput & { id?: string; stop: AlertStop; busNumber: string };
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function defaultStages(minutes: number) {
  return [...new Set([minutes, 3, 2, 1, 0])].filter(
    (s) => Number.isInteger(s) && s >= 0 && s <= minutes,
  );
}

/** 입력 중 문자열과 저장값을 구분하고 버스·지하철의 예약 조건을 함께 검증한다. */
export function validateSchedule(
  input: { days: number[]; startTime: string; endTime: string },
  threshold: string,
  selected?: number[],
) {
  const minutes = Number(threshold);
  if (
    !input.days.length ||
    new Set(input.days).size !== input.days.length ||
    input.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new Error('반복 요일을 선택해주세요.');
  if (!TIME.test(input.startTime) || !TIME.test(input.endTime) || input.startTime === input.endTime)
    throw new Error('시작·종료 시간을 서로 다르게 설정해주세요.');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30)
    throw new Error('도착 기준은 1~30분으로 입력해주세요.');
  const stages = [...new Set(selected ?? defaultStages(minutes))]
    .filter((s) => Number.isInteger(s) && s >= 0 && s <= minutes)
    .sort((a, b) => b - a);
  if (!stages.length) throw new Error('알림 시점을 최소 한 개 선택해주세요.');
  return { thresholdMinutes: minutes, notificationStages: stages };
}

/** 위치 전용 폼의 숨겨진 시간 필드는 기존 서버 계약을 보존한다. */
export function locationSchedule(draft: {
  startTime: string;
  endTime: string;
  thresholdMinutes: number;
  notificationStages?: number[];
}) {
  const fallbackMinutes =
    Number.isInteger(draft.thresholdMinutes) &&
    draft.thresholdMinutes >= 1 &&
    draft.thresholdMinutes <= 30
      ? draft.thresholdMinutes
      : 5;
  const locationStages = [
    ...new Set(draft.notificationStages ?? defaultStages(fallbackMinutes)),
  ].filter((s) => Number.isInteger(s) && s >= 0 && s <= fallbackMinutes);
  const startTime = TIME.test(draft.startTime) ? draft.startTime : '00:00';
  const endTime =
    TIME.test(draft.endTime) && draft.endTime !== startTime
      ? draft.endTime
      : startTime === '23:59'
        ? '00:00'
        : '23:59';
  return {
    startTime,
    endTime,
    thresholdMinutes: fallbackMinutes,
    notificationStages: locationStages.length ? locationStages : defaultStages(fallbackMinutes),
  };
}

/** 위치 전용 설정의 숨겨진 예약 필드는 서버 계약에 맞는 기본값만 유지한다. 복합 설정은 보존한다. */
export function buildBusAlertInput(
  draft: AlertDraft,
  kind: AlertKind,
  threshold: string,
): BusAlertInput {
  const scheduledEnabled = draft.id ? draft.scheduledEnabled : kind === 'time';
  const proximityEnabled = draft.id ? draft.proximityEnabled : kind === 'location';
  if (!scheduledEnabled && !proximityEnabled) throw new Error('알림 방식을 선택해주세요.');
  if (
    !draft.days.length ||
    new Set(draft.days).size !== draft.days.length ||
    draft.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new Error('반복 요일을 선택해주세요.');
  if (proximityEnabled && ![100, 200, 300, 500].includes(draft.radius))
    throw new Error('접근 반경을 선택해주세요.');
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
    ...(proximityEnabled ? { repeatMinutes } : {}),
  };
}

/** 서버의 사용자용 오류를 우선해 권한·저장 실패의 원인을 유지한다. */
export function alertErrorMessage(error: unknown) {
  const response = error as { response?: { data?: { message?: unknown } } };
  const message = response?.response?.data?.message;
  return typeof message === 'string'
    ? message
    : error instanceof Error
      ? error.message
      : '네트워크와 권한 설정을 확인해주세요.';
}
