import type { MapSymbol, Point } from '@/shared/types/geo';
import type { BusRouteDetail } from '../api/get-bus-route-detail';
import type { BusStop } from '../api/get-nearby-bus-stops';
import { busSymbolKey, matchBusStopSymbols } from './match-bus-stop-symbols';
import { isRouteBusStop } from './bus-route-presentation';

/** 모든 주변 승강장을 함께 배정한 뒤, 실제 노선 정류장에 해당하는 네이버 심벌만 강조한다. */
export function matchRouteSymbolPositions(
  stops: BusRouteDetail['stops'],
  symbols: MapSymbol[],
  busStops: BusStop[],
) {
  const positions = new Map<string, Point>();
  if (!stops.length || !symbols.length) return positions;
  const distance = (a: Point, b: Point) =>
    Math.hypot(
      a.latitude - b.latitude,
      (a.longitude - b.longitude) * Math.cos((a.latitude * Math.PI) / 180),
    ) * 111_320;
  // 화면 타일이 로딩 중이거나 축소되어도 노선의 정류장 자체를 배정에서 빼지 않는다.
  const stations: BusStop[] = [
    ...busStops,
    ...stops
      .filter(
        (stop) =>
          !busStops.some(
            (station) => distance(station, stop) <= 150 && isRouteBusStop(station, [stop]),
          ),
      )
      .map((stop) => ({
        id: `route:${stop.stationId}`,
        arsId: stop.mobileNo,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        distanceMeters: 0,
        type: '',
        providers: [],
      })),
  ];
  const candidates = symbols.filter((symbol) =>
    stations.some((stop) =>
      [stop, ...(stop.sourcePositions ?? [])].some((point) => distance(symbol, point) <= 75),
    ),
  );
  const matched = matchBusStopSymbols(candidates, stations);
  for (const symbol of candidates) {
    const station = matched.get(busSymbolKey(symbol));
    if (!station) continue;
    for (const stop of stops) {
      if (distance(station, stop) <= 150 && isRouteBusStop(station, [stop]))
        positions.set(stop.stationId, { latitude: symbol.latitude, longitude: symbol.longitude });
    }
  }
  return positions;
}
