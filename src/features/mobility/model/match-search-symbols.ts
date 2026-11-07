import {
  parseSubwaySymbolCaption,
  normalizeSubwayLineName,
  resolveSubwaySymbolLine,
} from '@/features/subway/model/subway-symbol-caption';
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
  arsId?: string | null;
  arsIds?: string[];
};

export function matchSearchSymbols(
  results: Place[],
  symbols: MapSymbol[],
  stops: BusStop[],
  subways: SubwayMapStation[],
  knownPositions: ReadonlyMap<string, Point> = new Map(),
) {
  const positions = new Map<string, Point>();
  if (!results.length || !symbols.length) return positions;
  const lineNames = [...new Set(subways.map((station) => station.lineName))].sort(
    (a, b) => b.length - a.length,
  );
  const normalizeStation = (caption: string) =>
    parseSubwaySymbolCaption(caption, lineNames).stationName;
  const reserved = new Set<string>();
  const searchedStationIds = new Set(
    results.filter((place) => place.id.startsWith('subway:')).map((place) => place.id.slice(7)),
  );
  const stationNames = new Set(
    subways
      .filter((station) => searchedStationIds.has(station.id))
      .map((station) => normalizeStation(station.name)),
  );
  const alignedSubways = subways
    .filter((station) => stationNames.has(normalizeStation(station.name)))
    .map((station) => ({ ...station, ...knownPositions.get(`subway:${station.id}`) }));
  const symbolsByStation = new Map<string, MapSymbol[]>();
  for (const symbol of symbols) {
    const name = normalizeStation(symbol.caption);
    if (!stationNames.has(name) || /(?:^|\D)\d{5}(?:\D|$)|버스정류/.test(symbol.caption)) continue;
    const peers = symbolsByStation.get(name) ?? [];
    peers.push(symbol);
    symbolsByStation.set(name, peers);
  }
  for (const name of stationNames) {
    const lines = alignedSubways.filter((station) => normalizeStation(station.name) === name);
    const peers = (symbolsByStation.get(name) ?? []).filter((symbol) =>
      lines.some(
        (station) =>
          Math.hypot(
            (station.latitude - symbol.latitude) * 111_320,
            (station.longitude - symbol.longitude) *
              111_320 *
              Math.cos((symbol.latitude * Math.PI) / 180),
          ) <= 200,
      ),
    );
    const assigned = new Set<string>();
    for (const symbol of peers) {
      const line = resolveSubwaySymbolLine(symbol, subways);
      if (!line) continue;
      const station = lines.find((station) => normalizeSubwayLineName(station.lineName) === line);
      if (!station || assigned.has(station.id)) continue;
      positions.set(`subway:${station.id}`, {
        latitude: symbol.latitude,
        longitude: symbol.longitude,
      });
      assigned.add(station.id);
      reserved.add(busSymbolKey(symbol));
    }
    const remainingLines = lines.filter((station) => !assigned.has(station.id));
    const remainingSymbols = peers.filter((symbol) => !reserved.has(busSymbolKey(symbol)));
    // 호선 없는 환승역 심벌을 다른 호선 핀으로 재배정하지 않는다.
    if (lines.length === 1 && remainingLines.length === 1 && remainingSymbols.length === 1) {
      positions.set(`subway:${remainingLines[0].id}`, remainingSymbols[0]);
    }
    for (const symbol of peers) reserved.add(busSymbolKey(symbol));
  }
  const busSymbols = symbols.filter((symbol) => !reserved.has(busSymbolKey(symbol)));
  const candidates: Candidate[] = stops.map((stop) => ({ ...stop, id: `station:${stop.id}` }));
  // 주변의 검색되지 않은 정류장·호선도 배정에 포함해야 같은 이름의 심벌을 빼앗지 않는다.
  const nearby = candidates.filter((candidate) =>
    busSymbols.some((symbol) =>
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
  const originals = new Map(busSymbols.map((symbol) => [busSymbolKey(symbol), symbol.caption]));
  const normalized = busSymbols.map((symbol) => {
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
    if (/(?:수도권)?\d+호선/.test(caption)) return false;
    const number = caption.match(/(?:^|\D)(\d{5})(?:\D|$)/)?.[1];
    return !number || [candidate.arsId, ...(candidate.arsIds ?? [])].includes(number);
  });
  for (const symbol of busSymbols) {
    const candidate = matched.get(busSymbolKey(symbol));
    if (candidate && ids.has(candidate.id))
      positions.set(candidate.id, { latitude: symbol.latitude, longitude: symbol.longitude });
  }
  return new Map([...positions].filter(([id]) => ids.has(id)));
}
