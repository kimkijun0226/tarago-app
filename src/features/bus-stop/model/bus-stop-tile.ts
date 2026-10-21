/** @fileoverview 지도 조회 영역을 Web Mercator 타일로 나눠 이동 중에도 정류장 Query 캐시를 재사용한다. */

import type { Coordinate } from '@/hooks/use-current-location';

/** Web Mercator 투영에 사용하는 지구 반지름이며 단위는 미터다. */
const EARTH_RADIUS_METERS = 6_378_137;

/** 정류장 조회를 시작할 최소 지도 확대 수준이다. */
const BUS_STOP_MIN_ZOOM = 15;

type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** 지도 영역을 나눠 서버 응답을 재사용하기 위한 타일의 조회 단위. */
export type BusStopTile = {
  tileX: number;
  tileY: number;
  center: Coordinate;
  sizeMeters: number;
  radiusMeters: number;
};

/**
 * WGS84 좌표를 고정 크기의 Web Mercator 타일 인덱스로 변환한다.
 *
 * 화면 이동 중 좌표가 조금 바뀌어도 같은 타일이면 동일한 Query 키를 쓰기 위한 변환이다.
 * @param latitude 타일에 포함될 위도(도).
 * @param longitude 타일에 포함될 경도(도).
 * @param sizeMeters 타일 한 변의 길이. 기본값 200m.
 * @param radiusMeters 서버에 요청할 타일 중심 반경. 기본값 250m.
 * @returns 타일 인덱스와 서버 조회에 사용할 중심 좌표·반경.
 */
export function getBusStopTile(
  latitude: number,
  longitude: number,
  sizeMeters = 200,
  radiusMeters = 250,
): BusStopTile {
  /** 경도를 투영 계산에 필요한 라디안으로 변환한 값이다. */
  const longitudeRadians = (longitude * Math.PI) / 180;

  /** 위도를 투영 계산에 필요한 라디안으로 변환한 값이다. */
  const latitudeRadians = (latitude * Math.PI) / 180;

  /** 경도를 Web Mercator의 가로 거리로 투영한 값이다. */
  const mercatorX = EARTH_RADIUS_METERS * longitudeRadians;

  /** 위도를 Web Mercator의 세로 거리로 투영한 값이다. */
  const mercatorY = EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2));

  /** 타일 영역의 가로 인덱스이며 같은 칸의 조회 키를 유지한다. */
  const tileX = Math.floor(mercatorX / sizeMeters);

  /** 타일 영역의 세로 인덱스이며 같은 칸의 조회 키를 유지한다. */
  const tileY = Math.floor(mercatorY / sizeMeters);
  return getBusStopTileFromIndex(tileX, tileY, sizeMeters, radiusMeters);
}

/**
 * 지도 영역 안에 걸친 타일을 인덱스 순서대로 계산한다.
 *
 * 입력 region의 위도·경도는 남서쪽 시작점이며 delta는 북동쪽까지의 범위다.
 * @param region 화면의 남서쪽 좌표와 위도·경도 범위.
 * @param sizeMeters 타일 한 변의 길이. 기본값 200m.
 * @param radiusMeters 각 타일 중심에서 조회할 반경. 기본값 250m.
 * @returns 지도 영역을 덮는 중복 없는 타일 목록.
 */
export function getBusStopTilesForRegion(
  region: MapRegion,
  sizeMeters = 200,
  radiusMeters = 250,
): BusStopTile[] {
  /** 조회 범위의 남서쪽 좌표를 포함하는 타일이다. */
  const southWest = getBusStopTile(region.latitude, region.longitude, sizeMeters, radiusMeters);

  /** 조회 범위의 북동쪽 좌표를 포함하는 타일이다. */
  const northEast = getBusStopTile(
    region.latitude + region.latitudeDelta,
    region.longitude + region.longitudeDelta,
    sizeMeters,
    radiusMeters,
  );

  /** 지도 범위를 덮는 타일을 순서대로 모으는 결과 배열이다. */
  const tiles: BusStopTile[] = [];

  /** tileX는 조회 범위의 가로 타일을 순서대로 방문하는 인덱스다. */
  for (let tileX = southWest.tileX; tileX <= northEast.tileX; tileX += 1) {
    /** tileY는 조회 범위의 세로 타일을 순서대로 방문하는 인덱스다. */
    for (let tileY = southWest.tileY; tileY <= northEast.tileY; tileY += 1) {
      tiles.push(getBusStopTileFromIndex(tileX, tileY, sizeMeters, radiusMeters));
    }
  }

  return tiles;
}

/**
 * 현재 줌에서 표시할 정류장 타일과 화면 밖 선조회 타일을 고른다.
 *
 * 줌 15 미만에는 정류장 조회를 중단한다. 멀리 볼수록 큰 타일을 사용해
 * 화면을 덮는 요청 수를 줄이고, 화면 밖 한 타일을 미리 받아 이동 시 공백을 줄인다.
 * @param zoom 현재 지도 줌. 없거나 15 미만이면 목록은 비어 있다.
 * @param region 현재 화면의 남서쪽 좌표와 범위.
 * @returns 화면과 가장자리 한 타일을 포함한 조회 목록.
 */
export function getVisibleBusStopTiles(zoom: number | undefined, region: MapRegion, margin = 1) {
  if (zoom === undefined || zoom < BUS_STOP_MIN_ZOOM) return [];

  /** 현재 확대 수준에 맞춘 타일 한 변의 길이이며 단위는 미터다. */
  const sizeMeters = zoom < 16 ? 1_000 : zoom < 17 ? 500 : 200;

  /** 타일 경계를 빠짐없이 덮도록 정한 서버 조회 반경이다. */
  const radiusMeters = zoom < 16 ? 750 : zoom < 17 ? 400 : 250;

  /** 화면이 타일 경계를 넘자마자 마커가 사라지지 않도록 가장자리도 조회한다. */
  const southWest = getBusStopTile(region.latitude, region.longitude, sizeMeters, radiusMeters);

  /** 조회 범위의 북동쪽 좌표를 포함하는 타일이다. */
  const northEast = getBusStopTile(
    region.latitude + region.latitudeDelta,
    region.longitude + region.longitudeDelta,
    sizeMeters,
    radiusMeters,
  );

  /** 지도 범위를 덮는 타일을 순서대로 모으는 결과 배열이다. */
  const tiles: BusStopTile[] = [];

  /** tileX는 조회 범위의 가로 타일을 순서대로 방문하는 인덱스다. */
  for (let tileX = southWest.tileX - margin; tileX <= northEast.tileX + margin; tileX += 1) {
    /** tileY는 조회 범위의 세로 타일을 순서대로 방문하는 인덱스다. */
    for (let tileY = southWest.tileY - margin; tileY <= northEast.tileY + margin; tileY += 1) {
      tiles.push(getBusStopTileFromIndex(tileX, tileY, sizeMeters, radiusMeters));
    }
  }
  return tiles;
}

/**
 * Web Mercator 타일 중심을 서버가 받는 WGS84 위도·경도로 되돌린다.
 * @param tileX 가로 타일 인덱스.
 * @param tileY 세로 타일 인덱스.
 * @param sizeMeters 타일 한 변의 길이.
 * @param radiusMeters 서버 조회에 사용할 반경.
 * @returns 타일 식별자와 위도·경도 중심 좌표.
 */
function getBusStopTileFromIndex(
  tileX: number,
  tileY: number,
  sizeMeters: number,
  radiusMeters: number,
): BusStopTile {
  /** 타일 가로 인덱스로 구한 Web Mercator 중심 거리다. */
  const centerX = (tileX + 0.5) * sizeMeters;

  /** 타일 세로 인덱스로 구한 Web Mercator 중심 거리다. */
  const centerY = (tileY + 0.5) * sizeMeters;

  return {
    tileX,
    tileY,
    sizeMeters,
    radiusMeters,
    center: {
      longitude: (centerX / EARTH_RADIUS_METERS) * (180 / Math.PI),
      latitude:
        (2 * Math.atan(Math.exp(centerY / EARTH_RADIUS_METERS)) - Math.PI / 2) * (180 / Math.PI),
    },
  };
}

/**
 * 타일 식별자가 같으면 화면 이동으로 생긴 새 배열도 기존 조회 영역으로 재사용한다.
 * @param currentTiles 이전 조회 타일. 순서도 비교 대상이다.
 * @param nextTiles 다음 조회 타일.
 * @returns 크기·인덱스·순서가 모두 같은지 여부.
 */
export function haveSameTiles(currentTiles: BusStopTile[], nextTiles: BusStopTile[]) {
  return (
    currentTiles.length === nextTiles.length &&
    currentTiles.every(
      (tile, index) =>
        tile.tileX === nextTiles[index]?.tileX &&
        tile.tileY === nextTiles[index]?.tileY &&
        tile.sizeMeters === nextTiles[index]?.sizeMeters,
    )
  );
}
