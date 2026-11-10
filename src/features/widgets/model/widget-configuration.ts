/** 사용자가 즐겨찾기에 직접 추가한 조회 대상. 예약 ID나 알림 조건에 의존하지 않는다. */
export type WidgetTarget = {
  color?: string;
  id: string;
  title: string;
  stationName: string;
  directionLabel: string;
} & (
  | {
      transport: 'bus';
      stationId: string;
      routeId: string;
      stationSeq?: number;
      latitude?: number;
      longitude?: number;
    }
  | {
      transport: 'subway';
      lineId: string;
      direction: string;
      expressOnly?: boolean;
      destination?: string;
      destinations?: string[];
    }
);
