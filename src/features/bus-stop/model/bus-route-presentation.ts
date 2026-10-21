/** @fileoverview 노선 시트 높이 전환과 왕복 경유 정류장 식별에 필요한 순수 화면 계산을 제공한다. */

type RouteStopCoordinate = {
  latitude: number;
  longitude: number;
  arsId?: string | null;
  arsIds?: string[];
  mobileNo?: string | null;
  sourcePositions?: { latitude: number; longitude: number }[];
};
export type RouteSheetSnap = 'compact' | 'half' | 'full';

/**
 * 노선 시트의 세 높이 사이를 이동하되 양 끝에서는 현재 단계를 유지한다.
 * @param current 현재 높이 단계.
 * @param direction 이동 방향.
 * @returns 한 단계 이동한 높이.
 */
export function nextRouteSheetSnap(
  current: RouteSheetSnap,
  direction: 'up' | 'down',
): RouteSheetSnap {
  /** 시트의 낮은 높이부터 높은 높이까지의 순서를 정의한다. */
  const order: RouteSheetSnap[] = ['compact', 'half', 'full'];

  /** 현재 시트 단계에서 이동 방향을 적용한 다음 높이 인덱스다. */
  const index = order.indexOf(current) + (direction === 'up' ? 1 : -1);
  return order[Math.max(0, Math.min(index, order.length - 1))];
}

/** 통과 지점은 도로 형상에만 남기고 승하차 가능한 정류장으로 활성화하지 않는다. */
export function isBoardingRouteStop(stop: { name: string; mobileNo?: string | null }) {
  return !/미정차|폐지|경유|통과/.test(stop.name) && !/^0+$/.test(stop.mobileNo?.trim() ?? '');
}

/**
 * 공급자 정류장 ID와 앱 UUID가 달라도 같은 실제 위치를 알아본다.
 * 유효한 이용자용 번호가 양쪽에 있으면 번호를 우선하고, 없으면 10m 이내 좌표를 비교한다.
 * @param marker 지도에 표시하는 정류장 좌표와 이용자용 번호.
 * @param routeStops 비교할 노선 경유 정류장.
 * @returns 같은 실제 정류장으로 판단되는 경유가 있는지 여부.
 */
export function isRouteBusStop(marker: RouteStopCoordinate, routeStops: RouteStopCoordinate[]) {
  return routeStops.some((stop) => {
    /** 지도 정류장의 공백을 제거한 이용자용 번호다. */
    const arsId = marker.arsId?.trim();

    /** 노선 경유 정류장의 공백을 제거한 이용자용 번호다. */
    const mobileNo = stop.mobileNo?.trim();
    if (arsId && mobileNo && arsId !== '0' && mobileNo !== '0')
      return arsId === mobileNo || Boolean(marker.arsIds?.includes(mobileNo));

    return [marker, ...(marker.sourcePositions ?? [])].some((point) => {
      const north = (point.latitude - stop.latitude) * 111_320;
      const east =
        (point.longitude - stop.longitude) * 111_320 * Math.cos((point.latitude * Math.PI) / 180);
      return north * north + east * east <= 10 * 10;
    });
  });
}

/**
 * 선택 행의 가운데를 목록 가운데에 맞추고 목록 양 끝에서는 범위를 넘지 않는다.
 * @param rowY 선택 행의 콘텐츠 내 시작 위치.
 * @param rowHeight 선택 행 높이.
 * @param viewportHeight 목록 표시 영역 높이.
 * @param contentHeight 전체 목록 높이.
 * @returns 유효 스크롤 범위 안의 세로 오프셋.
 */
export function getSelectedStopScrollOffset(
  rowY: number,
  rowHeight: number,
  viewportHeight: number,
  contentHeight: number,
) {
  return Math.max(
    0,
    Math.min(contentHeight - viewportHeight, rowY + rowHeight / 2 - viewportHeight / 2),
  );
}

/**
 * 같은 정류소를 왕복으로 경유할 때 현재 보고 있던 순번에 가까운 경유를 선택한다.
 * @param stops 순번을 가진 전체 경유 목록. 원본 배열은 변경하지 않는다.
 * @param stationId 찾을 서버 정류장 ID.
 * @param currentSeq 현재 선택 순번.
 * @returns 순번 차이가 가장 작은 경유. 해당 정류장이 없으면 undefined.
 */
export function getRouteStopOccurrence<T extends { stationId: string; stationSeq: number }>(
  stops: T[],
  stationId: string,
  currentSeq: number,
): T | undefined {
  return stops
    .filter((stop) => stop.stationId === stationId)
    .sort((a, b) => Math.abs(a.stationSeq - currentSeq) - Math.abs(b.stationSeq - currentSeq))[0];
}
