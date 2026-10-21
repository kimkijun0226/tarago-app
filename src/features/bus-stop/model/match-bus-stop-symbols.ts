import type { MapSymbol, Point } from '@/shared/types/geo';
import type { BusStop } from '../api/get-nearby-bus-stops';

export function busSymbolKey(point: Point) {
  return `${point.latitude.toFixed(7)}:${point.longitude.toFixed(7)}`;
}

/** 화면의 심벌과 정류장을 최소 총 거리로 일대일 배정해 반대 방향 승강장을 재사용하지 않는다. */
export function matchBusStopSymbols<T extends Pick<BusStop, 'id' | 'name' | 'latitude' | 'longitude' | 'sourcePositions'>>(symbols: MapSymbol[], stops: T[], eligible?: (symbol: MapSymbol, station: T) => boolean) {
  const normalize = (name: string) => name.replace(/버스정류장|[\s()[\]·.,]/g, '');
  const stations = [...new Map(stops.map((stop) => [stop.id, stop])).values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const names = new Set(stations.map((stop) => normalize(stop.name)));
  const points = [
    ...new Map(
      symbols
        .filter((symbol) => !normalize(symbol.caption) || names.has(normalize(symbol.caption)))
        .map((symbol) => [busSymbolKey(symbol), symbol]),
    ).values(),
  ].sort((a, b) => busSymbolKey(a).localeCompare(busSymbolKey(b)));
  const result = new Map<string, T>();
  if (!points.length || !stations.length) return result;
  const limit = 75 ** 2;
  const costs = points.map((point) =>
    stations
      .map((stop) => {
        if (eligible && !eligible(point, stop)) return 1e9;
        const distance = Math.min(
          ...[stop, ...(stop.sourcePositions ?? [])].map(
            (position) =>
              ((position.latitude - point.latitude) * 111_320) ** 2 +
              ((position.longitude - point.longitude) *
                111_320 *
                Math.cos((point.latitude * Math.PI) / 180)) **
                2,
          ),
        );
        if (distance > limit) return 1e9;
        const caption = normalize(point.caption);
        // 출구 번호·상점처럼 이름이 다른 심벌은 가까워도 정류장으로 배정하지 않는다.
        if (caption && caption !== normalize(stop.name)) return 1e9;
        return distance;
      })
      .concat(points.map(() => limit + 401)),
  );

  // 더미 열은 대응하는 공식 정류장이 없는 지도 심벌을 미배정 상태로 남긴다.
  const rows = points.length,
    columns = stations.length + rows;
  const rowPotential = Array(rows + 1).fill(0);
  const columnPotential = Array(columns + 1).fill(0);
  const owner = Array(columns + 1).fill(0);
  const previous = Array(columns + 1).fill(0);
  for (let row = 1; row <= rows; row++) {
    owner[0] = row;
    let column = 0;
    const minimum = Array(columns + 1).fill(Infinity);
    const visited = Array(columns + 1).fill(false);
    do {
      visited[column] = true;
      const currentRow = owner[column];
      let delta = Infinity,
        nextColumn = 0;
      for (let next = 1; next <= columns; next++) {
        if (visited[next]) continue;
        const cost =
          costs[currentRow - 1][next - 1] - rowPotential[currentRow] - columnPotential[next];
        if (cost < minimum[next]) {
          minimum[next] = cost;
          previous[next] = column;
        }
        if (minimum[next] < delta) {
          delta = minimum[next];
          nextColumn = next;
        }
      }
      for (let next = 0; next <= columns; next++) {
        if (visited[next]) {
          rowPotential[owner[next]] += delta;
          columnPotential[next] -= delta;
        } else minimum[next] -= delta;
      }
      column = nextColumn;
    } while (owner[column] !== 0);
    do {
      const next = previous[column];
      owner[column] = owner[next];
      column = next;
    } while (column !== 0);
  }
  for (let column = 1; column <= stations.length; column++) {
    const row = owner[column] - 1;
    if (row >= 0 && costs[row][column - 1] < limit + 401)
      result.set(busSymbolKey(points[row]), stations[column - 1]);
  }
  return result;
}
