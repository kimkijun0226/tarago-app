/** @fileoverview 차량 응답을 노선별 도착 목록으로 묶고 ETA와 남은 정류장 수를 화면 문구로 변환한다. */

import type { BusArrival } from '@/features/bus-stop/api/get-bus-arrivals';

/** 같은 노선의 첫 번째·두 번째 도착 차량을 화면에 함께 표시하는 형태. */
export type BusArrivalGroup = {
  routeId: string;
  stationSeq?: number;
  busNumber: string;
  routeType: string;
  first: BusArrival;
  second?: BusArrival;
};

/**
 * 도착 예정 초를 사용자에게 표시할 문구로 바꾼다.
 * @param etaSeconds 도착까지 남은 시간(초).
 * @param serviceStatus 공급자 도착·차량위치 정보로 확인한 운행 상태.
 * @param precision 분 단위 원본에는 존재하지 않는 초 정밀도를 표시하지 않는다.
 * @param source 노선 차량 위치와 남은 경유 경로로 계산한 예상값인지 여부.
 * @returns ETA가 없으면 확인된 상태를 우선 표시하고, 있으면 도착 시간 문구.
 */
export function formatEta(
  etaSeconds: number | null,
  serviceStatus?: BusArrival['serviceStatus'],
  precision?: BusArrival['etaPrecision'],
  source?: BusArrival['etaSource'],
) {
  if (etaSeconds === null) {
    if (serviceStatus === 'turnaround_waiting') return '회차지 대기 중';
    if (serviceStatus === 'before_turnaround') return '운행정보 확인 중';
    if (serviceStatus === 'on_route') return '노선 운행 중';
    return '운행정보 확인 중';
  }
  if (source === 'turnaround_estimate')
    return `예상 약 ${Math.max(1, Math.ceil(etaSeconds / 60))}분`;
  if (etaSeconds <= 60) return '곧 도착';
  if (precision === 'minutes') return `약 ${Math.ceil(etaSeconds / 60)}분`;
  if (etaSeconds <= 600) return `${Math.floor(etaSeconds / 60)}분 ${Math.floor(etaSeconds % 60)}초`;
  return `${Math.ceil(etaSeconds / 60)}분`;
}

/**
 * 남은 정류장 수를 도착 정보 문구로 바꾼다.
 * @param remainingStops 버스가 도착 전까지 남은 정류장 수.
 * @returns 정류장 수 또는 도착 정보 확인 중 문구.
 */
export function formatRemainingStops(remainingStops: number | null) {
  if (remainingStops === null) return '';
  return remainingStops <= 0 ? '도착 정보 확인 중' : `${remainingStops}정류장 전`;
}

/**
 * 같은 노선의 차량을 묶고 가장 가까운 두 대만 도착 순서로 남긴다.
 *
 * 서버 응답은 차량 단위이므로 그대로 렌더링하면 같은 버스 번호가
 * 여러 줄 나온다. 노선별로 묶은 뒤 첫 차 ETA 기준으로 목록을 정렬한다.
 * @param arrivals 서버에서 받은 차량별 도착 정보.
 * @returns 첫 차 도착이 빠른 순서의 노선 목록.
 */
export function groupBusArrivals(arrivals: BusArrival[]): BusArrivalGroup[] {
  /** 왕복 경유를 구분하는 노선 키에 차량 도착 응답을 모으는 색인이다. */
  const byRoute = new Map<string, BusArrival[]>();

  /** arrival은 노선·경유 순번별로 묶을 현재 차량 도착 응답이다. */
  for (const arrival of arrivals) {
    /** 노선 ID와 경유 순번을 결합해 반대 방향 차량이 섞이지 않게 하는 키다. */
    const key = `${arrival.routeId}:${arrival.stationSeq ?? ''}`;

    /** 같은 노선과 경유 순번에 속한 차량 응답 목록이다. */
    const routeArrivals = byRoute.get(key) ?? [];
    routeArrivals.push(arrival);
    byRoute.set(key, routeArrivals);
  }

  /** 노선별 가까운 두 차량을 묶어 최종 ETA 순으로 정렬할 목록이다. */
  const groups = [...byRoute.entries()].map(([, routeArrivals]) => {
    /** ETA 정렬 후 화면에 함께 표시할 첫 번째·두 번째 도착 차량이다. */
    const [first, second] = [...routeArrivals]
      .sort((left, right) => (left.etaSeconds ?? Infinity) - (right.etaSeconds ?? Infinity))
      .slice(0, 2);

    return {
      routeId: first.routeId,
      stationSeq: first.stationSeq,
      busNumber: first.busNumber,
      routeType: first.routeType,
      first,
      second,
    };
  });

  return groups.sort(
    (left, right) => (left.first.etaSeconds ?? Infinity) - (right.first.etaSeconds ?? Infinity),
  );
}

/** 공급자가 반환한 노선 유형만 배지로 변환한다. 알 수 없는 코드는 일반버스로 단정하지 않는다. */
export function getBusRouteBadge(routeType: string): { label: string; color: string } | null {
  if (routeType.includes('직행좌석')) return { label: '직행좌석', color: '#EB4335' };
  if (routeType.includes('광역') || routeType === '6') return { label: '광역', color: '#EB4335' };
  if (routeType.includes('급행')) return { label: '급행', color: '#EB4335' };
  if (routeType === '3' || routeType.includes('간선')) return { label: '간선', color: '#386DE8' };
  if (routeType === '4' || routeType.includes('지선')) return { label: '지선', color: '#38BE40' };
  if (routeType === '2' || routeType.includes('마을')) return { label: '마을', color: '#87C600' };
  if (routeType.includes('일반')) return { label: '일반', color: '#386DE8' };
  if (routeType.includes('좌석')) return { label: '좌석', color: '#386DE8' };
  return null;
}
