/** @fileoverview 검색 대상과 주변 교통시설을 함께 배정해 실제 네이버 심벌 위치만 검색 핀으로 사용한다. */
import type { Place } from '../api/mobility';
import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import type { SubwayMapStation } from '@/features/subway/api/get-subway-station';
import {
  busSymbolKey,
  matchBusStopSymbols,
} from '@/features/bus-stop/model/match-bus-stop-symbols';
import type { MapSymbol, Point } from '@/shared/types/geo';

type Candidate = Pick<BusStop, 'id' | 'name' | 'latitude' | 'longitude' | 'sourcePositions'> & {
  subwayLineName?: string;
  arsId?: string | null;
  arsIds?: string[];
};

export function matchSearchSymbols(
  results: Place[],
  symbols: MapSymbol[],
  stops: BusStop[],
  subways: SubwayMapStation[],
) {
  const positions = new Map<string, Point>();
  if (!results.length || !symbols.length) return positions;
  const candidates: Candidate[] = [
    ...stops.map((stop) => ({ ...stop, id: `station:${stop.id}` })),
    ...subways.map((station) => ({
      ...station,
      id: `subway:${station.id}`,
      subwayLineName: station.lineName,
      name: `${station.name.replace(/역$/, '')}역`,
    })),
  ];
  // 주변의 검색되지 않은 정류장·호선도 배정에 포함해야 같은 이름의 심벌을 빼앗지 않는다.
  const nearby = candidates.filter((candidate) =>
    symbols.some((symbol) =>
      [candidate, ...(candidate.sourcePositions ?? [])].some(
        (point) =>
          Math.abs(point.latitude - symbol.latitude) <= 0.0007 &&
          Math.abs(
            (point.longitude - symbol.longitude) * Math.cos((symbol.latitude * Math.PI) / 180),
          ) <= 0.0007,
      ),
    ),
  );
  const ids = new Set(results.map((place) => place.id));
  const originals = new Map(symbols.map((symbol) => [busSymbolKey(symbol), symbol.caption]));
  const normalized = symbols.map((symbol) => {
    const number = symbol.caption.match(/(?:^|\D)(\d{5})(?:\D|$)/)?.[1];
    const exact = number
      ? nearby.find((candidate) => [candidate.arsId, ...(candidate.arsIds ?? [])].includes(number))
      : undefined;
    const caption =
      exact?.name ??
      symbol.caption
        .replace(/(?:수도권)?\d+호선/g, '')
        .replace(/[()[\]]/g, '')
        .trim();
    const station = subways.find((item) => caption === item.name.replace(/역$/, ''));
    return { ...symbol, caption: station ? `${station.name.replace(/역$/, '')}역` : caption };
  });
  const matched = matchBusStopSymbols(normalized, nearby, (symbol, candidate) => {
    const caption = originals.get(busSymbolKey(symbol)) ?? '';
    // 이름·호선이 없는 심벌을 지하철역으로 추정하면 가까운 버스·상점 아이콘에 역 핀이 꽂힌다.
    if (candidate.subwayLineName && !caption.trim()) return false;
    const line =
      caption.match(/(?:수도권)?(\d+호선)/)?.[1] ??
      subways.find(
        (station) => !/^\d+호선$/.test(station.lineName) && caption.includes(station.lineName),
      )?.lineName;
    if (line && candidate.subwayLineName !== line) return false;
    const number = caption.match(/(?:^|\D)(\d{5})(?:\D|$)/)?.[1];
    return !number || [candidate.arsId, ...(candidate.arsIds ?? [])].includes(number);
  });
  for (const symbol of symbols) {
    const candidate = matched.get(busSymbolKey(symbol));
    if (candidate && ids.has(candidate.id))
      positions.set(candidate.id, { latitude: symbol.latitude, longitude: symbol.longitude });
  }
  return positions;
}
