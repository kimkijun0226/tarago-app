/** @fileoverview 반복 예약을 수정하지 않고 접근 동의 시점의 한국 시간으로 일회성 1시간 감시 입력을 만든다. */
import type { BusAlertInput } from './bus-alert';

/** 기존 반복 예약을 변경하지 않고 접근 확인 시점부터 한 시간만 감시한다. */
export function immediateMonitoring(source: BusAlertInput, now = Date.now()): BusAlertInput {
  /** 동의를 받은 시점으로부터 정확히 한 시간 뒤의 종료 타임스탬프다. */
  const end = now + 60 * 60_000;

  /** UTC 접근자를 이용해 한국 시간의 요일과 시각을 추출하기 위한 9시간 이동 값이다. */
  const kst = new Date(now + 9 * 60 * 60_000);
  return {
    ...source,
    enabled: true,
    proximityEnabled: false,
    scheduledEnabled: true,
    days: [kst.getUTCDay()],
    startTime: kst.toISOString().slice(11, 16),
    endTime: new Date(end + 9 * 60 * 60_000).toISOString().slice(11, 16),
    monitoringStartedAt: new Date(now).toISOString(),
    monitoringEndsAt: new Date(end).toISOString(),
  };
}
