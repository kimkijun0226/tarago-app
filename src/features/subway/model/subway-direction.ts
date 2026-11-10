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

/** 2호선 본선의 상·하행 별칭만 내·외선으로 맞추고 지선의 방면은 유지한다. */
export function normalizeSubwayDirection(
  line: Pick<SubwayStationLine, 'lineId' | 'stationNumber'> | undefined,
  direction: string,
  arrivals: SubwayArrival[] = [],
) {
  const circular =
    line?.lineId === '1002' &&
    (/^0?2\d{2}$/.test(line.stationNumber) ||
      arrivals.some(
        (train) => train.lineId === line.lineId && ['내선', '외선'].includes(train.direction),
      ));
  return circular
    ? direction === '상행'
      ? '내선'
      : direction === '하행'
        ? '외선'
        : direction
    : direction;
}

/** 시간표와 실시간 응답을 같은 방면 기준으로 결합한다. */
export function normalizeSubwayDirections(
  line: Pick<SubwayStationLine, 'lineId' | 'stationNumber'> | undefined,
  arrivals: SubwayArrival[],
  scheduled: SubwayTimetable['directions'] = [],
) {
  return {
    arrivals: arrivals.map((train) =>
      train.lineId === line?.lineId
        ? { ...train, direction: normalizeSubwayDirection(line, train.direction, arrivals) }
        : train,
    ),
    scheduled: scheduled.map((entry) => ({
      ...entry,
      direction: normalizeSubwayDirection(line, entry.direction, arrivals),
    })),
  };
}

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
  let nextStationName =
    matches.length === 1
      ? matches[0].name
      : scheduled.find((item) => item.direction === direction)?.nextStationName;
  // 직선 구간의 상·하행만 공식 역번호 인접 관계를 보완값으로 사용한다.
  if (!nextStationName && !['1002', '1063'].includes(line?.lineId ?? '')) {
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
  expressOnly?: boolean;
  lineId: string;
  direction?: string;
  nextStationName?: string;
  destination?: string;
  destinations?: string[];
  destinationNames?: string[];
}) {
  if ('direction' in alert && alert.direction === 'all')
    return [alert.lineName ?? alert.lineId, '방면 상관없음', alert.expressOnly && '급행만'].filter(Boolean).join(' · ');
  const destinations = alert.destinations ?? (alert.destination ? [alert.destination] : []);
  const bounds = destinations.slice(0, 2).map(destinationLabel).join(' · ');
  return [
    alert.lineName ?? alert.lineId,
    ...(alert.expressOnly ? ['급행만'] : []),
    alert.nextStationName ? `${stationLabel(alert.nextStationName)} 방면` : '방면 확인 중',
    bounds
      ? `${bounds}${destinations.length > 2 ? ` 외 ${destinations.length - 2}개` : ''}`
      : '모든 행선지',
  ].join(' · ');
}

export const subwayDestinationKey = (name: string) =>
  name
    .replace(/\([^)]*\)/g, '')
    .trim()
    .replace(/행$/, '')
    .replace(/역$/, '')
    .trim();

/** 현재 실시간 열차뿐 아니라 시간표 전체의 종착역을 모아 개별 알림 대상을 제공한다. */
export function subwayAlertOptions(
  line: SubwayStationLine | undefined,
  arrivals: SubwayArrival[],
  scheduled: SubwayTimetable['directions'] = [],
  existing?: { direction: string; destination?: string; destinations?: string[] },
) {
  type Option = {
    key: string;
    direction: string;
    destination?: string;
    nextStationName?: string;
    destinationNames?: string[];
    title: string;
    subtitle: string;
  };
  const options: Option[] = [
    { key: 'all', direction: 'all', title: '상관없음', subtitle: '이 호선의 모든 행선지' },
  ];
  if (!line) return options;
  ({ arrivals, scheduled } = normalizeSubwayDirections(line, arrivals, scheduled));
  if (
    existing &&
    line.lineId === '1002' &&
    scheduled.some((entry) => ['내선', '외선'].includes(entry.direction))
  ) {
    existing = {
      ...existing,
      direction:
        existing.direction === '상행'
          ? '내선'
          : existing.direction === '하행'
            ? '외선'
            : existing.direction,
    };
  }
  const directions = [
    ...new Set([
      ...scheduled.filter((item) => item.trains.length > 0).map((item) => item.direction),
      ...arrivals.filter((item) => item.lineId === line.lineId).map((item) => item.direction),
      ...(existing?.direction && existing.direction !== 'all' ? [existing.direction] : []),
    ]),
  ];
  for (const direction of directions) {
    const presentation = subwayDirectionPresentation(line, direction, arrivals, scheduled);
    const names = new Map<string, string>();
    for (const name of [
      ...scheduled
        .filter((item) => item.direction === direction)
        .flatMap((item) => item.trains.map((train) => train.destination)),
      ...arrivals
        .filter((item) => item.lineId === line.lineId && item.direction === direction)
        .map((item) => item.destination),
      ...(existing?.direction === direction
        ? (existing.destinations ?? (existing.destination ? [existing.destination] : []))
        : []),
    ]) {
      if (name.trim()) names.set(subwayDestinationKey(name), name.replace(/행$/, '').trim());
    }
    const bounds = presentation.nextStationName
      ? `${stationLabel(presentation.nextStationName)} 방면`
      : `${direction} 방면`;
    options.push({
      key: `${direction}:all`,
      direction,
      nextStationName: presentation.nextStationName,
      destinationNames: [...names.values()].slice(0, 12),
      title: `${bounds} · 전체`,
      subtitle: '이 방향의 모든 행선지',
    });
    for (const [key, destination] of [...names].sort((a, b) => a[1].localeCompare(b[1], 'ko'))) {
      options.push({
        key: `${direction}:${key}`,
        direction,
        destination,
        nextStationName: presentation.nextStationName,
        destinationNames: [destination],
        title: destinationLabel(destination),
        subtitle: bounds,
      });
    }
  }
  return options;
}

/** 저장된 단일 행선지 알림도 함께 지원한다. */
export function matchesSubwayDestination(
  target: { destination?: string; destinations?: string[] },
  destination: string,
) {
  const names = target.destinations ?? (target.destination ? [target.destination] : undefined);
  return (
    !names || names.some((name) => subwayDestinationKey(name) === subwayDestinationKey(destination))
  );
}

export const isExpressTrain = (train: Pick<SubwayArrival, 'trainType'>) =>
  /급행|특급/.test(train.trainType);

/** 선택한 역·방면·행선지의 실시간 또는 공식 시간표에서 급행이 확인된 경우만 선택을 제공한다. */
export function hasSubwayExpress(
  line: SubwayStationLine | undefined,
  arrivals: SubwayArrival[],
  scheduled: SubwayTimetable['directions'] | undefined,
  target: { direction: string; destination?: string; destinations?: string[] },
) {
  if (!line || !target.direction) return false;
  const normalized = normalizeSubwayDirections(line, arrivals, scheduled);
  const direction = normalizeSubwayDirection(line, target.direction, arrivals);
  const matchesDirection = (value: string) => direction === 'all' || value === direction;
  return normalized.arrivals.some((train) =>
    train.lineId === line.lineId && matchesDirection(train.direction) &&
    isExpressTrain(train) && matchesSubwayDestination(target, train.destination)
  ) || normalized.scheduled.some((entry) =>
    matchesDirection(entry.direction) && entry.trains.some((train) =>
      train.isExpress && matchesSubwayDestination(target, train.destination)
    )
  );
}
