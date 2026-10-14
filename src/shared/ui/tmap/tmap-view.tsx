import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { forwardRef, useImperativeHandle, useState, type ComponentType } from 'react';
import { Text, View, type ViewProps } from 'react-native';
import type { Point } from '@/features/mobility/api/mobility';

export type MapRegion = Point & { latitudeDelta: number; longitudeDelta: number };
export type TmapMarker = Point & {
  id: string; kind?: 'place'; imageUri?: string; width?: number; height?: number;
  anchor?: { x: number; y: number }; caption?: string; minZoom?: number;
  rotation?: number; captionMinZoom?: number;
};
export type TmapLine = { id: string; points: Point[]; color: string; width: number };
type Camera = Point & { zoom?: number; duration?: number };
type Command = Camera & { id: number; bounds?: { south: number; west: number; north: number; east: number } };
export type TmapViewRef = {
  animateCameraTo: (camera: Camera) => void;
  animateCameraWithTwoCoords: (camera: { coord1: Point; coord2: Point; duration?: number }) => void;
};
type Props = ViewProps & {
  initialCamera: Camera; markers: TmapMarker[]; lines: TmapLine[]; position: Point | null;
  padding: { top: number; bottom: number }; onReady: () => void;
  onCameraIdle: (value: { zoom: number; region: MapRegion }) => void;
  onMarkerPress: (id: string) => void;
};
type NativeProps = Omit<Props, 'onReady' | 'onCameraIdle' | 'onMarkerPress'> & {
  camera?: Command;
  onReady: (event: { nativeEvent: Record<string, never> }) => void;
  onCameraIdle: (event: { nativeEvent: { zoom: number; region: MapRegion } }) => void;
  onMarkerPress: (event: { nativeEvent: { id: string } }) => void;
  onError: (event: { nativeEvent: { message: string } }) => void;
};
const NativeMap: ComponentType<NativeProps> | null = requireOptionalNativeModule('TaragoTmap')
  ? requireNativeView('TaragoTmap') : null;

/** 지도 조작을 네이티브 SDK에 맡기고 이동이 끝난 영역만 서버 조회에 전달한다. */
export const TmapView = forwardRef<TmapViewRef, Props>(function TmapView({onReady,onCameraIdle,onMarkerPress,...props}, ref) {
  const [camera, setCamera] = useState<Command>();
  const [error, setError] = useState<string | null>(null);
  useImperativeHandle(ref, () => ({
    animateCameraTo: next => setCamera(previous => ({ ...next, id: (previous?.id ?? 0) + 1 })),
    animateCameraWithTwoCoords: ({coord1,coord2,duration}) => setCamera(previous => ({
      id: (previous?.id ?? 0) + 1, duration,
      latitude: (coord1.latitude + coord2.latitude) / 2, longitude: (coord1.longitude + coord2.longitude) / 2,
      bounds: { south: Math.min(coord1.latitude,coord2.latitude), west: Math.min(coord1.longitude,coord2.longitude),
        north: Math.max(coord1.latitude,coord2.latitude), east: Math.max(coord1.longitude,coord2.longitude) },
    })),
  }), []);
  if (!NativeMap) return <View style={[props.style,{alignItems:'center',justifyContent:'center',padding:32}]}>
    <Text style={{fontSize:18,textAlign:'center'}}>지도 화면을 사용하려면 앱을 업데이트해주세요.</Text>
  </View>;
  return <View style={props.style}>
    <NativeMap {...props} style={{flex:1}} camera={camera}
      onReady={() => onReady()} onCameraIdle={event => onCameraIdle(event.nativeEvent)}
      onMarkerPress={event => onMarkerPress(event.nativeEvent.id)} onError={event => setError(event.nativeEvent.message.includes('TMAP_API_KEY') ? '지도 연결 설정을 확인 중입니다.' : '지도를 불러오지 못했어요. 잠시 후 다시 시도해주세요.')} />
    {error ? <View style={{position:'absolute',bottom:24,left:20,right:20,padding:16,backgroundColor:'#FFFFFF',borderRadius:12}}>
      <Text style={{color:'#B42318'}}>{error}</Text>
    </View> : null}
  </View>;
});
