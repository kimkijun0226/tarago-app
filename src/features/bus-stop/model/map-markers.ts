import { Image } from 'react-native';
import type { TmapMarker } from '@/shared/ui/tmap/tmap-view';
import type { BusStop } from '../api/get-nearby-bus-stops';

const STOP_IMAGE = require('../../../../assets/images/bus-stop-marker.png');
const SELECTED_STOP_IMAGE = require('../../../../assets/images/bus-stop-selected-marker.png');
const ROUTE_STOP_IMAGE = require('../../../../assets/images/bus-stop-route-marker.png');
const ROUTE_SELECTED_STOP_IMAGE = require('../../../../assets/images/bus-stop-route-selected-marker.png');
export function markerImage(asset: number): string { return Image.resolveAssetSource(asset).uri; }
export function stopMarker(stop: BusStop, selected: boolean, route = false): TmapMarker {
  return {id:`stop:${stop.id}`,latitude:stop.latitude,longitude:stop.longitude,
    imageUri:markerImage(route ? selected ? ROUTE_SELECTED_STOP_IMAGE : ROUTE_STOP_IMAGE : selected ? SELECTED_STOP_IMAGE : STOP_IMAGE),
    width:selected ? 40 : route ? 24 : 20,height:selected ? 48 : route ? 24 : 20,
    anchor:{x:.5,y:selected ? 1 : .5},caption:selected ? '' : stop.name,minZoom:15};
}

export const routeStopImage = markerImage(ROUTE_STOP_IMAGE);
