/** @fileoverview 지도 타일 Query를 관찰하고 새 영역이 준비될 때까지 이전 영역의 정류장 표시를 유지한다. */

import { useCallback, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';

import { getNearbyBusStops } from '@/features/bus-stop/api/get-nearby-bus-stops';
import { combineBusStops } from './combine-bus-stops';
import { haveSameTiles, type BusStopTile } from '@/features/bus-stop/model/bus-stop-tile';
import type { BusStop } from '../api/get-nearby-bus-stops';

/**
 * 지도 타일마다 독립된 Query를 만들고 정류장 ID를 기준으로 결과를 합친다.
 *
 * 타일 크기와 인덱스를 Query 키로 사용해 화면이 조금 움직여도 결과를 재사용한다.
 * 30분 동안 stale·GC 시간을 유지하므로 같은 지역을 다시 볼 때 불필요한
 * 서버 요청을 줄인다. 이 시간은 데이터의 실시간 도착 ETA에는 적용되지 않는다.
 * 서로 겹치는 반경에서 같은 정류장이 와도 마커는 한 번만 표시한다.
 * @param tiles 현재 화면과 선조회 여유 영역을 덮는 타일 목록.
 * @returns 타일 응답을 합쳐 중복을 제거한 정류장 목록.
 */
export function useNearbyBusStops(tiles: BusStopTile[]) {
  /** 새 영역이 준비될 때까지 유지할 이전 타일 식별자 상태다. 서버 응답은 복제하지 않고 Query에 둔다. */
  const [previousTiles, setPreviousTiles] = useState<BusStopTile[]>([]);

  /** 현재 화면의 타일 키 집합이며 tiles 변경 시에만 다시 만든다. */
  const activeKeys = useMemo(() => new Set(tiles.map(tileKey)), [tiles]);

  /** 새 응답이 준비될 때까지 이전 타일과 현재 타일을 함께 관찰하는 목록이다. */
  const observedTiles = useMemo(
    () =>
      tiles.length
        ? [...new Map([...previousTiles, ...tiles].map((tile) => [tileKey(tile), tile])).values()]
        : [],
    [previousTiles, tiles],
  );

  /** 관찰 타일별 요청과 캐시 설정이며 화면 밖 이전 타일의 새 요청은 막는다. */
  const queries = useMemo(
    () =>
      observedTiles.map((tile) => ({
        queryKey: [
          'bus-stops',
          'tile',
          'separate-station-identities-v6',
          tile.sizeMeters,
          tile.tileX,
          tile.tileY,
        ],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          getNearbyBusStops({
            latitude: tile.center.latitude,
            longitude: tile.center.longitude,
            radius: tile.radiusMeters,
            signal,
          }),
        enabled: activeKeys.has(tileKey(tile)),
        staleTime: 30 * 60_000,
        gcTime: 30 * 60_000,
      })),
    [activeKeys, observedTiles],
  );

  /**
   * 타일 결과를 합치고 현재 화면 타일에 응답이 모두 있는지 판정한다.
   * useQueries는 combine 참조 변경 시 다시 결합하므로 activeKeys·observedTiles 변경 때만 교체한다.
   */
  const combine = useCallback(
    (results: { data?: BusStop[] }[]) => ({
      stops: combineBusStops(results),
      ready: results.every(
        (result, index) =>
          !activeKeys.has(tileKey(observedTiles[index])) || result.data !== undefined,
      ),
    }),
    [activeKeys, observedTiles],
  );

  /** 여러 타일 Query에서 결합한 정류장 목록과 현재 영역의 준비 상태다. */
  const result = useQueries({ queries, combine });
  if ((result.ready || previousTiles.length === 0) && !haveSameTiles(previousTiles, tiles))
    setPreviousTiles(tiles);
  return result.stops;
}

/** 타일 크기도 포함해 서로 다른 줌 단계의 동일 인덱스가 충돌하지 않게 한다. */
function tileKey(tile: BusStopTile) {
  return `${tile.sizeMeters}:${tile.tileX}:${tile.tileY}`;
}
