/** @fileoverview 로컬 정류장 이미지를 현재 Tmap 오버레이 계약으로 변환한다. 네이버 지도 SDK에 의존하지 않는다. */

import { Image } from 'react-native';
import type { TmapMarker } from '@/shared/ui/tmap/tmap-view';
import type { BusStop } from '../api/get-nearby-bus-stops';

/** 일반 정류장에 사용하는 로컬 이미지 자산이다. */
const STOP_IMAGE = require('../../../../assets/images/bus-stop-marker.png');

/** 선택한 일반 정류장의 강조 이미지 자산이다. */
const SELECTED_STOP_IMAGE = require('../../../../assets/images/bus-stop-selected-marker.png');

/** 노선 위 경유 정류장의 로컬 이미지 자산이다. */
const ROUTE_STOP_IMAGE = require('../../../../assets/images/bus-stop-route-marker.png');

/** 노선에서 선택한 정류장의 강조 이미지 자산이다. */
const ROUTE_SELECTED_STOP_IMAGE = require('../../../../assets/images/bus-stop-route-selected-marker.png');

/**
 * 번들 이미지를 네이티브 지도에 전달할 URI로 해석한다.
 * @param asset require로 읽은 로컬 이미지 식별자.
 * @returns 현재 실행 환경에서 접근할 이미지 URI.
 */
export function markerImage(asset: number): string {
  return Image.resolveAssetSource(asset).uri;
}

/**
 * 정류장 선택·노선 상태에 맞는 이미지와 크기를 갖는 Tmap 마커를 만든다.
 * 호출자가 마커 배열을 메모이제이션하므로 이 짧은 변환 자체에는 별도 캐시를 두지 않는다.
 * @param stop 서버 정류장 좌표와 이름.
 * @param selected 현재 선택한 정류장 여부.
 * @param route 노선 상세에서 사용하는 마커 여부.
 * @returns Tmap에 전달할 정류장 오버레이.
 */
export function stopMarker(stop: BusStop, selected: boolean, route = false): TmapMarker {
  return {
    id: `stop:${stop.id}`,
    latitude: stop.latitude,
    longitude: stop.longitude,
    imageUri: markerImage(
      route
        ? selected
          ? ROUTE_SELECTED_STOP_IMAGE
          : ROUTE_STOP_IMAGE
        : selected
          ? SELECTED_STOP_IMAGE
          : STOP_IMAGE,
    ),
    width: selected ? 40 : route ? 24 : 20,
    height: selected ? 48 : route ? 24 : 20,
    anchor: { x: 0.5, y: selected ? 1 : 0.5 },
    caption: selected ? '' : stop.name,
    minZoom: 15,
  };
}

/** 노선 경유 마커에 공통으로 전달할 이미지 URI다. */
export const routeStopImage = markerImage(ROUTE_STOP_IMAGE);
