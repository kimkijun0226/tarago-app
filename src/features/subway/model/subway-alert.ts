/** @fileoverview 역·노선·방향별 반복 감시 시간과 단계별 도착 알림의 서버 저장 계약을 정의한다. */

/** 서버에 저장하는 반복 감시 설정. days는 일요일 0부터 토요일 6까지이며 시각은 한국 시간 HH:mm이다. */
export interface SubwayAlertInput {
  stationName: string;
  lineId: string;
  lineName?: string;
  direction: string;
  destination?: string;
  days: number[];
  startTime: string;
  endTime: string;
  thresholdMinutes: number;
  /** thresholdMinutes 이하의 알림 단계. 0은 곧 도착 알림이다. */
  notificationStages: number[];
  enabled: boolean;
}
/** 서버가 예약 ID를 부여한 저장 결과. */
export interface SubwayAlert extends SubwayAlertInput {
  id: string;
}
