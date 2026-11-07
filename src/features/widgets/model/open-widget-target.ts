import { router } from 'expo-router';
import { queryClient } from '@/shared/lib/query-client';
import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import { getBusRouteDetail } from '@/features/bus-stop/api/get-bus-route-detail';
import type { WidgetTarget } from './widget-configuration';

/** 즐겨찾기 항목을 알림 예약 없이 기존 지도의 정류소·역 상세 경로로 연다. */
export async function openWidgetTarget(item: WidgetTarget) {
  const notificationId = `favorite:${item.id}:${Date.now()}`;
  if (item.transport === 'subway') {
    router.navigate({
      pathname: '/',
      params: {
        notificationId,
        subwayStationName: item.stationName,
        subwayLineName: item.title,
        subwayLineId: item.lineId,
        stationId: '',
        latitude: '',
        longitude: '',
        routeId: '',
        stationSeq: '',
      },
    });
    return;
  }
  let point =
    Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
      ? { latitude: item.latitude!, longitude: item.longitude! }
      : undefined;
  if (!point) {
    const cached = queryClient
      .getQueriesData<BusStop[]>({ queryKey: ['bus-stops'] })
      .flatMap(([, stops]) => (Array.isArray(stops) ? stops : []))
      .find((stop) => stop.id === item.stationId || stop.stationIds?.includes(item.stationId));
    if (cached) point = cached;
  }
  if (!point) {
    const route = await queryClient.fetchQuery({
      queryKey: ['bus-route-overview', item.stationId, item.routeId, item.stationSeq ?? 0, '', ''],
      queryFn: ({ signal }) =>
        getBusRouteDetail(item.stationId, item.routeId, item.stationSeq ?? 0, signal, true),
      staleTime: 30 * 60_000,
    });
    point = route.stops.find(
      (stop) =>
        stop.stationId === route.selectedStationId &&
        (item.stationSeq === undefined || stop.stationSeq === item.stationSeq),
    );
  }
  if (
    !point ||
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  )
    throw new Error('정류소 위치를 찾을 수 없습니다. 잠시 후 다시 시도해주세요.');
  router.navigate({
    pathname: '/',
    params: {
      notificationId,
      stationId: item.stationId,
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      subwayStationName: '',
      subwayLineName: '',
      subwayLineId: '',
      routeId: '',
      stationSeq: '',
    },
  });
}
