/** @fileoverview 로컬 정류장 이미지를 공통 지도 마커 입력으로 변환한다. */

import { Image } from 'react-native';
import type { MapMarker } from '@/shared/ui/map/map-view';
import type { BusStop } from '../api/get-nearby-bus-stops';

/** 검색과 선택 상태에서 동일하게 사용하는 버스 핀이다. */
const STOP_IMAGE = require('../../../../assets/images/search-bus-marker.png');

/** 32×40 이미지의 실제 핀 끝 (16, 38)을 지도 좌표에 맞춘다. */
export const PIN_MARKER_ANCHOR = { x: 0.5, y: 38 / 40 };

/**
 * 번들 이미지를 네이티브 지도에 전달할 URI로 해석한다.
 * @param asset require로 읽은 로컬 이미지 식별자.
 * @returns 현재 실행 환경에서 접근할 이미지 URI.
 */
export function markerImage(asset: number): string {
  return Image.resolveAssetSource(asset).uri;
}

/**
 * 정류장 선택·노선 상태에 맞는 이미지와 크기를 갖는 지도 마커를 만든다.
 * 호출자가 마커 배열을 메모이제이션하므로 이 짧은 변환 자체에는 별도 캐시를 두지 않는다.
 * @param stop 서버 정류장 좌표와 이름.
 * @param selected 현재 선택한 정류장 여부.
 * @param route 노선 상세에서 사용하는 마커 여부.
 * @returns 지도에 전달할 정류장 오버레이.
 */
export function stopMarker(stop: BusStop, selected: boolean, route = false): MapMarker {
  return {
    id: `stop:${stop.id}`,
    latitude: stop.latitude,
    longitude: stop.longitude,
    imageUri: markerImage(STOP_IMAGE),
    width: selected ? 36 : route ? 26.4 : 22,
    height: selected ? 45 : route ? 33 : 27.5,
    anchor: PIN_MARKER_ANCHOR,
    caption: selected ? '' : stop.name,
    minZoom: selected ? 0 : 15,
  };
}

/** 노선 경유 마커에 공통으로 전달할 이미지 URI다. */
export const routeStopImage = markerImage(STOP_IMAGE);
