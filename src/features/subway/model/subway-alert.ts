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
  notificationStages: number[];
  enabled: boolean;
}
export interface SubwayAlert extends SubwayAlertInput { id: string }
