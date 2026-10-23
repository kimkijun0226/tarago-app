/** 서버와 동일하게 한국 시간·시작일 요일을 기준으로 시간 알림 조회를 허용한다. */
export function isAlertQueryWindow(
  alert: {
    days: number[];
    startTime: string;
    endTime: string;
    monitoringStartedAt?: string;
    monitoringEndsAt?: string;
  },
  now = Date.now(),
): boolean {
  if (alert.monitoringEndsAt) {
    const start = Date.parse(alert.monitoringStartedAt ?? '');
    const end = Date.parse(alert.monitoringEndsAt);
    return Number.isFinite(start) && Number.isFinite(end) && now >= start && now < end;
  }
  const kst = new Date(now + 9 * 60 * 60_000);
  const clock = kst.toISOString().slice(11, 16);
  if (alert.startTime < alert.endTime) {
    if (clock < alert.startTime || clock >= alert.endTime) return false;
  } else {
    if (clock >= alert.endTime && clock < alert.startTime) return false;
    if (clock < alert.endTime) kst.setUTCDate(kst.getUTCDate() - 1);
  }
  return alert.days.includes(kst.getUTCDay());
}
