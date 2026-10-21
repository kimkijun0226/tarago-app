/** @fileoverview 네이버 지도 SDK에 앱의 카메라·마커·노선·현재 위치를 연결한다. */
import {
  NaverMapView,
  NaverMapMarkerOverlay,
  NaverMapPolylineOverlay,
  type NaverMapViewRef,
} from '@mj-studio/react-native-naver-map';
import { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import type { ViewProps } from 'react-native';
import type { MapSymbol, Point } from '@/shared/types/geo';

/** 남서쪽 기준 좌표와 위도·경도 폭으로 표현하는 화면 범위. */
export type MapRegion = Point & { latitudeDelta: number; longitudeDelta: number };
/** 네이티브 마커의 좌표·자산·크기·앵커·라벨 표시 계약. */
export type MapMarker = Point & {
  id: string;
  kind?: 'place';
  imageUri?: string;
  width?: number;
  height?: number;
  anchor?: { x: number; y: number };
  caption?: string;
  minZoom?: number;
  rotation?: number;
  captionMinZoom?: number;
  /** 선과 마커 종류 사이의 표시 순서이며 값이 클수록 위에 표시한다. */
  globalZIndex?: number;
};
/** 지도에 그릴 연속 좌표와 선 색상·두께. */
export type MapLine = { id: string; points: Point[]; color: string; width: number };
type Camera = Point & { zoom?: number; duration?: number };
/** 화면에서 사용하는 지도 이동 명령이다. */
export type MapViewRef = {
  animateCameraTo: (camera: Camera) => void;
  animateCameraWithTwoCoords: (camera: { coord1: Point; coord2: Point; duration?: number }) => void;
};
type Props = ViewProps & {
  initialCamera: Camera;
  markers: MapMarker[];
  lines: MapLine[];
  position: Point | null;
  padding: { top: number; bottom: number };
  /** 카메라 패딩과 별개로 로고를 지도 내 보이는 공간에 배치하는 하단 간격이다. */
  logoBottomInset: number;
  onReady: () => void;
  onCameraIdle: (value: { zoom: number; region: MapRegion; symbols: MapSymbol[] }) => void;
  onMarkerPress: (id: string) => void;
  onSymbolPress: (symbol: Point & { caption: string; peers: Point[] }) => void;
};

/** 카메라는 명시적인 화면 요청으로만 이동하며 사용자 제스처는 네이버 SDK가 처리한다. */
export const MapView = forwardRef<MapViewRef, Props>(function MapView(
  {
    initialCamera,
    markers,
    lines,
    position,
    padding,
    logoBottomInset,
    onReady,
    onCameraIdle,
    onMarkerPress,
    onSymbolPress,
    ...props
  },
  ref,
) {
  const map = useRef<NaverMapViewRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      animateCameraTo: (camera) => map.current?.animateCameraTo(camera),
      animateCameraWithTwoCoords: (camera) => map.current?.animateCameraWithTwoCoords(camera),
    }),
    [],
  );

  return (
    <NaverMapView
      {...props}
      ref={map}
      initialCamera={initialCamera}
      mapPadding={padding}
      layerGroups={{
        BUILDING: true,
        TRANSIT: true,
        TRAFFIC: false,
        BICYCLE: false,
        MOUNTAIN: false,
        CADASTRAL: false,
      }}
      logoAlign="BottomLeft"
      logoMargin={{ left: 16, bottom: logoBottomInset - padding.bottom }}
      isShowScaleBar={false}
      isShowCompass={false}
      isShowZoomControls={false}
      isShowLocationButton={false}
      isTiltGesturesEnabled={false}
      onInitialized={onReady}
      onTapMap={({ latitude, longitude, symbolCaption, symbolPeers }) => {
        let peers: Point[] = [];
        try {
          const parsed: unknown = JSON.parse(symbolPeers || '[]');
          if (Array.isArray(parsed))
            peers = parsed.filter(
              (p): p is Point =>
                p !== null &&
                typeof p === 'object' &&
                Number.isFinite(p.latitude) &&
                Number.isFinite(p.longitude),
            );
        } catch {
          console.warn('지도 역 심벌 목록을 읽지 못했습니다.');
        }
        // 빈 지도 클릭과 이름이 없는 교통 심벌 클릭을 구분한다.
        if (!symbolCaption && !peers.length) return;
        onSymbolPress({ latitude, longitude, caption: symbolCaption ?? '', peers });
      }}
      onCameraIdle={({ zoom, region, visibleSymbols }) => {
        let symbols: MapSymbol[] = [];
        try {
          const parsed: unknown = JSON.parse(visibleSymbols || '[]');
          if (Array.isArray(parsed)) symbols = parsed.slice(0, 512).filter((item): item is MapSymbol =>
            item !== null && typeof item === 'object' && Number.isFinite(item.latitude)
            && Number.isFinite(item.longitude) && typeof item.caption === 'string');
        } catch {
          console.warn('지도 심벌 좌표를 읽지 못했습니다.');
        }
        if (zoom !== undefined && region.latitudeDelta > 0 && region.longitudeDelta > 0) {
          onCameraIdle({ zoom, region, symbols });
        }
      }}
      locationOverlay={{ isVisible: position !== null, position: position ?? undefined }}
    >
      {lines
        .filter((line) => line.points.length > 1)
        .map((line) => (
          <NaverMapPolylineOverlay
            key={line.id}
            coords={line.points}
            width={line.width}
            color={line.color}
            globalZIndex={0}
          />
        ))}
      {markers.map((marker) => (
        <MapMarkerView key={marker.id} marker={marker} onPress={onMarkerPress} />
      ))}
    </NaverMapView>
  );
});

/** 마커 입력이 같으면 다른 지도 UI 변경으로 이미지를 다시 전달하지 않는다. */
const MapMarkerView = memo(function MapMarkerView({
  marker,
  onPress,
}: {
  marker: MapMarker;
  onPress: (id: string) => void;
}) {
  return (
    <NaverMapMarkerOverlay
      latitude={marker.latitude}
      longitude={marker.longitude}
      width={marker.width}
      height={marker.height}
      anchor={marker.anchor}
      angle={marker.rotation}
      minZoom={marker.minZoom}
      globalZIndex={marker.globalZIndex ?? 200}
      isHideCollidedSymbols={false}
      isHideCollidedMarkers={false}
      isHideCollidedCaptions={marker.id.startsWith('search-result:')}
      isForceShowIcon={marker.id.startsWith('search-result:')}
      image={
        marker.imageUri
          ? { httpUri: marker.imageUri, reuseIdentifier: marker.imageUri }
          : { symbol: 'red' }
      }
      caption={{ text: marker.caption ?? '', minZoom: marker.captionMinZoom ?? 18, textSize: 12 }}
      onTap={() => onPress(marker.id)}
    />
  );
});
