import MapScreen from '@/features/map/ui/map-screen';

/** 위젯은 알림 탭을 경유하지 않는 독립된 지도 경로를 사용한다. */
export default function WidgetMapScreen() {
  return <MapScreen mode="widget" />;
}
