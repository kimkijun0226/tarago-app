import type { SubwayArrival } from '../api/get-subway-arrivals';
import type { SubwayStationLine, SubwayTimetable } from '../api/get-subway-station';

const stationKey = (name: string) =>
  name
    .replace(/\s*\([^)]*\)\s*$/, '')
    .replace(/역$/, '')
    .trim();
export const stationLabel = (name: string) => (name.endsWith('역') ? name : `${name}역`);
export const destinationLabel = (name: string) => {
  const value = name.trim();
  return !value ? '행선지 미제공' : value.endsWith('행') ? value : `${value}행`;
};

/** 실제 방면 정보와 인접역을 대조한다. 순환·지선의 다음 역을 종착역으로 추측하지 않는다. */
export function subwayDirectionPresentation(
  line: Pick<SubwayStationLine, 'lineId' | 'previousStation' | 'nextStation'> | undefined,
  direction: string,
  arrivals: SubwayArrival[],
  scheduled: SubwayTimetable['directions'] = [],
) {
  const trains = arrivals.filter((a) => a.lineId === line?.lineId && a.direction === direction);
  const neighbors = [line?.previousStation, line?.nextStation].filter(
    (n): n is NonNullable<typeof n> => Boolean(n),
  );
  const namedNeighbors = trains
    .map((a) =>
      a.destinationDirection
        ?.split(/\s+-\s+/)
        .slice(1)
        .join(' - ')
        .replace(/\s*방면$/, '')
        .trim(),
    )
    .filter((name): name is string => Boolean(name));
  const matches = neighbors.filter((n) =>
    namedNeighbors.some((name) => stationKey(name) === stationKey(n.name)),
  );
  let nextStationName = matches.length === 1 ? matches[0].name : undefined;
  // 직선 구간의 상·하행만 공식 역번호 인접 관계를 보완값으로 사용한다.
  if (!nextStationName && line?.lineId !== '1002') {
    if (direction === '상행') nextStationName = line?.previousStation?.name;
    else if (direction === '하행') nextStationName = line?.nextStation?.name;
  }
  const liveNames = trains.map((a) => a.destination).filter(Boolean);
  const planned =
    scheduled
      .find((s) => s.direction === direction)
      ?.trains.map((t) => t.destination)
      .filter(Boolean) ?? [];
  const destinationNames = [
    ...new Set(
      (liveNames.length ? liveNames : planned)
        .map((name) => name.replace(/행$/, '').trim())
        .filter(Boolean),
    ),
  ].slice(0, 12);
  return { nextStationName, destinationNames };
}

export function subwayAlertSubtitle(alert: {
  lineName?: string;
  lineId: string;
  nextStationName?: string;
  destination?: string;
  destinationNames?: string[];
}) {
  const destinations = alert.destination ? [alert.destination] : (alert.destinationNames ?? []);
  const bounds = destinations.slice(0, 2).map(destinationLabel).join(' · ');
  return [
    alert.lineName ?? alert.lineId,
    alert.nextStationName ? `${stationLabel(alert.nextStationName)} 방면` : '방면 확인 중',
    bounds || '행선지 미제공',
  ].join(' · ');
}
