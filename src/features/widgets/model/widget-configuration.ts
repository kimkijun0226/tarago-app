/** 사용자가 위젯에 직접 추가한 조회 대상. 예약 ID나 알림 조건에 의존하지 않는다. */
export type WidgetTarget = {
  color?: string;
  id: string;
  title: string;
  stationName: string;
  directionLabel: string;
} & (
  | { transport: 'bus'; stationId: string; routeId: string; stationSeq?: number }
  | {
      transport: 'subway';
      lineId: string;
      direction: string;
      destination?: string;
      destinations?: string[];
    }
);
