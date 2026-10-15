/**
 * @fileoverview React 화면과 로컬 TaragoTmap 네이티브 지도 모듈 사이의 어댑터.
 * SDK의 이벤트를 일반 좌표·ID로 바꾸고 카메라 명령의 일련번호를 관리한다.
 * 정류장 조회·알림·길찾기 규칙은 이 계층에서 처리하지 않는다.
 */
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { forwardRef, useImperativeHandle, useState, type ComponentType } from 'react';
import { Text, View, type ViewProps } from 'react-native';
import type { Point } from '@/shared/types/geo';

/** 남서쪽 기준 좌표와 위도·경도 폭으로 표현하는 화면 범위. */
export type MapRegion = Point & { latitudeDelta: number; longitudeDelta: number };
/** 네이티브 마커의 좌표·자산·크기·앵커·라벨 표시 계약. */
export type TmapMarker = Point & {
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
};
/** 지도에 그릴 연속 좌표와 선 색상·두께. */
export type TmapLine = { id: string; points: Point[]; color: string; width: number };
type Camera = Point & { zoom?: number; duration?: number };
type Command = Camera & {
  id: number;
  bounds?: { south: number; west: number; north: number; east: number };
};
/** 화면에서 호출 가능한 지도 이동 명령만 노출해 네이티브 SDK 구현을 숨긴다. */
export type TmapViewRef = {
  animateCameraTo: (camera: Camera) => void;
  animateCameraWithTwoCoords: (camera: { coord1: Point; coord2: Point; duration?: number }) => void;
};
type Props = ViewProps & {
  initialCamera: Camera;
  markers: TmapMarker[];
  lines: TmapLine[];
  position: Point | null;
  padding: { top: number; bottom: number };
  onReady: () => void;
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

/** 현재 바이너리에 TaragoTmap 모듈이 있으면 연결하는 네이티브 뷰다. 없으면 업데이트 안내를 표시한다. */
const NativeMap: ComponentType<NativeProps> | null = requireOptionalNativeModule('TaragoTmap')
  ? requireNativeView('TaragoTmap')
  : null;

/** 지도 조작을 네이티브 SDK에 맡기고 이동이 끝난 영역만 서버 조회에 전달한다. */
export const TmapView = forwardRef<TmapViewRef, Props>(function TmapView(
  { onReady, onCameraIdle, onMarkerPress, ...props },
  ref,
) {
  /** 네이티브에 전달할 최신 카메라 명령과 갱신 함수다. 일련번호로 같은 좌표의 재요청도 구분한다. */
  const [camera, setCamera] = useState<Command>();

  /** 네이티브 지도에서 전달한 오류를 사용자 안내로 표시하기 위한 상태다. */
  const [error, setError] = useState<string | null>(null);

  /**
   * 화면은 SDK 객체 대신 이 명령 계약만 참조한다.
   * 같은 좌표를 다시 요청해도 새 명령으로 인식하도록 id를 올린다.
   * 명령은 React prop으로 네이티브에 전달해야 하므로 ref에만 저장하지 않고 state를 쓴다.
   * setState만 참조하는 명령 객체는 빈 의존성으로 유지하며 별도 useMemo는 중복이다.
   */
  useImperativeHandle(
    ref,
    () => ({
      animateCameraTo: (next) =>
        setCamera((previous) => ({ ...next, id: (previous?.id ?? 0) + 1 })),
      animateCameraWithTwoCoords: ({ coord1, coord2, duration }) =>
        setCamera((previous) => ({
          id: (previous?.id ?? 0) + 1,
          duration,
          latitude: (coord1.latitude + coord2.latitude) / 2,
          longitude: (coord1.longitude + coord2.longitude) / 2,
          bounds: {
            south: Math.min(coord1.latitude, coord2.latitude),
            west: Math.min(coord1.longitude, coord2.longitude),
            north: Math.max(coord1.latitude, coord2.latitude),
            east: Math.max(coord1.longitude, coord2.longitude),
          },
        })),
    }),
    [],
  );
  if (!NativeMap)
    return (
      <View style={[props.style, { alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
        <Text style={{ fontSize: 18, textAlign: 'center' }}>
          지도 화면을 사용하려면 앱을 업데이트해주세요.
        </Text>
      </View>
    );
  return (
    <View style={props.style}>
      <NativeMap
        {...props}
        style={{ flex: 1 }}
        camera={camera}
        onReady={() => onReady()}
        onCameraIdle={(event) => onCameraIdle(event.nativeEvent)}
        onMarkerPress={(event) => onMarkerPress(event.nativeEvent.id)}
        onError={(event) =>
          setError(
            event.nativeEvent.message.includes('TMAP_API_KEY')
              ? '지도 연결 설정을 확인 중입니다.'
              : '지도를 불러오지 못했어요. 잠시 후 다시 시도해주세요.',
          )
        }
      />
      {error ? (
        <View
          style={{
            position: 'absolute',
            bottom: 24,
            left: 20,
            right: 20,
            padding: 16,
            backgroundColor: '#FFFFFF',
            borderRadius: 12,
          }}
        >
          <Text style={{ color: '#B42318' }}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
});
