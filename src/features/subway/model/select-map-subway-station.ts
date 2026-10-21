/** @fileoverview 같은 역 이름의 지도 심벌들을 호선별 공식 좌표와 일대일로 연결한다. */
import type { Point } from '@/shared/types/geo';
import type { SubwayMapStation } from '../api/get-subway-station';

/** 각 심벌을 독립적으로 최근접 조회하면 환승역의 여러 심벌이 같은 호선으로 합쳐질 수 있다. */
export function selectMapSubwayStation(
  point: Point,
  stations: SubwayMapStation[],
  peers: Point[],
): SubwayMapStation | undefined {
  if (!stations.length) return undefined;
  const unique = [
    ...new Map(
      [...peers, point].map((p) => [`${p.latitude.toFixed(7)}:${p.longitude.toFixed(7)}`, p]),
    ).values(),
  ];
  if (unique.length > 6 || stations.length > 6) return undefined;
  const clicked = unique.findIndex(
    (p) =>
      Math.abs(p.latitude - point.latitude) < 1e-7 &&
      Math.abs(p.longitude - point.longitude) < 1e-7,
  );
  const longitudeScale = Math.cos((point.latitude * Math.PI) / 180);
  let bestCost = Infinity;
  let best: SubwayMapStation | undefined;
  // 같은 이름의 버스 심벌이 함께 있어도 각 호선에는 심벌 하나만 배정한다.
  const assignStations = unique.length >= stations.length;
  const count = assignStations ? stations.length : unique.length;
  function assign(index: number, used: Set<number>, cost: number, selected?: SubwayMapStation) {
    if (cost >= bestCost) return;
    if (index === count) {
      bestCost = cost;
      best = selected;
      return;
    }
    const choices = assignStations ? unique.length : stations.length;
    for (let choice = 0; choice < choices; choice++) {
      if (used.has(choice)) continue;
      const station = stations[assignStations ? index : choice];
      const symbolIndex = assignStations ? choice : index;
      const latitude = station.latitude - unique[symbolIndex].latitude;
      const longitude = (station.longitude - unique[symbolIndex].longitude) * longitudeScale;
      used.add(choice);
      assign(
        index + 1,
        used,
        cost + latitude ** 2 + longitude ** 2,
        symbolIndex === clicked ? station : selected,
      );
      used.delete(choice);
    }
  }
  assign(0, new Set(), 0);
  return best;
}
