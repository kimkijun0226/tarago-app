import { Redirect, useLocalSearchParams } from 'expo-router';
import type { AlertRouteParams } from '@/features/bus-alert/model/alert-route';

/** 기존 지하철 알림 링크를 네이티브 알림 탭의 공통 편집기로 연결한다. */
export default function SubwayAlertsScreen() {
  const params = useLocalSearchParams<AlertRouteParams>();
  return (
    <Redirect href={{ pathname: '/alerts', params: { ...params, alertTransport: 'subway' } }} />
  );
}
