/** @fileoverview 목록과 지도는 같은 Query 캐시를 공유하며 일반 검색은 장소·주소·정류장·지하철역을 함께 제공한다. */
import { useMemo } from 'react';
import { compareSearchRelevance } from './search-relevance';
import type { SearchResultFilter } from './place-kind';
import { useQuery } from '@tanstack/react-query';
import { searchPlaces, type Place, type Point } from '../api/mobility';
import { searchBusStops } from '@/features/bus-stop/api/search-bus-stops';
import { getSubwayMapStations } from '@/features/subway/api/get-subway-station';

export type SearchMapRequest = { query: string; position: Point; filter: SearchResultFilter };
const searchPolicy = {
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  refetchOnMount: false,
} as const;

export function usePlaceSearch(
  query: string,
  position: Point,
  enabled: boolean,
  transitOnly = true,
) {
  const genericPlaces = useQuery({
    queryKey: ['mobility', 'places', query, position.latitude, position.longitude],
    queryFn: ({ signal }) => searchPlaces(query, position, signal),
    enabled: enabled && !transitOnly && query.length >= 2,
    staleTime: 5 * 60_000,
    ...searchPolicy,
  });
  const subways = useQuery({
    queryKey: ['subway', 'map-stations'],
    queryFn: ({ signal }) => getSubwayMapStations(signal),
    enabled: enabled && query.length >= 2,
    staleTime: 86_400_000,
    gcTime: 86_400_000,
    ...searchPolicy,
  });
  const stations = useQuery({
    queryKey: [
      'bus-stops',
      'search',
      'separate-station-identities-v6',
      query,
      position.latitude,
      position.longitude,
    ],
    queryFn: ({ signal }) => searchBusStops(query, position, signal),
    enabled: enabled && query.length >= 2,
    staleTime: 5 * 60_000,
    ...searchPolicy,
  });
  const results = useMemo<Place[]>(() => {
    if (!enabled || query.length < 2) return [];
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const subwayPlaces: Place[] = (subways.data ?? [])
      .filter((station) => {
        const name = `${station.name.replace(/역$/, '')}역 ${station.lineName}`.toLowerCase();
        return terms.every((term) => name.includes(term));
      })
      .map((station) => ({
        id: `subway:${station.id}`,
        name: `${station.name.replace(/역$/, '')}역`,
        latitude: station.latitude,
        longitude: station.longitude,
        address: station.lineName,
        category: '지하철역',
        subwayLineName: station.lineName,
        distanceMeters: Math.round(
          Math.hypot(
            (station.latitude - position.latitude) * 111_320,
            (station.longitude - position.longitude) *
              111_320 *
              Math.cos((position.latitude * Math.PI) / 180),
          ),
        ),
      }));
    const items: Place[] = [
      ...(stations.data ?? []).map((stop) => ({
        id: `station:${stop.id}`,
        name: stop.name,
        latitude: stop.latitude,
        longitude: stop.longitude,
        address: stop.arsIds?.join(', ') || stop.arsId || '',
        category: '버스정류장',
        distanceMeters: stop.distanceMeters,
      })),
      ...subwayPlaces,
      ...(!transitOnly ? (genericPlaces.data ?? []).map((place) => {
        const name = place.name.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim();
        const line = `${place.name} ${place.category}`.match(/(?:수도권)?(\d+호선)/)?.[1];
        const matches = subwayPlaces.filter((station) =>
          station.name === name && (!line || station.subwayLineName === line),
        );
        return matches.length === 1 ? matches[0] : place;
      }) : []),
    ];
    return [
      ...new Map(
        items
          .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude))
          .map((place) => [place.id, place]),
      ).values(),
    ].sort((a, b) => compareSearchRelevance(query, a, b));
  }, [
    enabled,
    query,
    stations.data,
    subways.data,
    genericPlaces.data,
    transitOnly,
    position.latitude,
    position.longitude,
  ]);
  return { places: transitOnly ? subways : genericPlaces, subways, stations, results };
}
