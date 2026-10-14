import type { BusAlertInput } from './bus-alert';

/** 기존 반복 예약을 변경하지 않고 접근 확인 시점부터 한 시간만 감시한다. */
export function immediateMonitoring(source:BusAlertInput, now = Date.now()):BusAlertInput {
  const end = now+60*60_000;
  const kst = new Date(now+9*60*60_000);
  return {...source,enabled:true,proximityEnabled:false,scheduledEnabled:true,
    days:[kst.getUTCDay()],startTime:kst.toISOString().slice(11,16),
    endTime:new Date(end+9*60*60_000).toISOString().slice(11,16),
    monitoringStartedAt:new Date(now).toISOString(),monitoringEndsAt:new Date(end).toISOString()};
}
