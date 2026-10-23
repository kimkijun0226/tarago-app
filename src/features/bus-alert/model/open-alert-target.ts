import { router } from 'expo-router';
import { queryClient } from '@/shared/lib/query-client';
import { useAppStore } from '@/shared/model/app-store';
import { getAlerts } from '../api/alerts';
import { getSubwayStation } from '@/features/subway/api/get-subway-station';
import type { SubwayAlert } from '@/features/subway/model/subway-alert';
import type { BusAlert } from './bus-alert';
import { getSubwayAlerts } from '@/features/subway/api/subway-alerts';

/** 푸시·내역·저장 카드가 같은 알림 대상을 지도에서 연다. 수정은 수정 아이콘으로만 진입한다. */
export async function openAlertTarget(
  transport: 'bus' | 'subway',
  alertId: string,
  requestId: string,
  payload: Record<string, unknown> = {},
) {
  try {
    let params: Record<string, string>;
    if (transport === 'subway') {
      const saved =
        queryClient.getQueryData<SubwayAlert[]>(['subway-alerts'])?.find((a) => a.id === alertId) ??
        (
          await queryClient.fetchQuery({
            queryKey: ['subway-alerts'],
            queryFn: () => getSubwayAlerts(),
          })
        ).find((a) => a.id === alertId);
      const name =
        saved?.stationName ?? (typeof payload.stationName === 'string' ? payload.stationName : '');
      if (!name) throw new Error('알림 대상 역을 찾을 수 없습니다.');
      let lineName = saved?.lineName;
      const lineId = saved?.lineId ?? String(payload.lineId ?? '');
      if (!lineName && lineId) {
        const station = await queryClient.fetchQuery({
          queryKey: ['subway', name, 'station'],
          queryFn: () => getSubwayStation(name),
          staleTime: 86_400_000,
        });
        lineName = station.lines.find((line) => line.lineId === lineId)?.lineName;
      }
      params = {
        subwayStationName: name,
        subwayLineName: lineName ?? '',
        subwayLineId: saved?.lineId ?? String(payload.lineId ?? ''),
        notificationId: requestId,
        stationId: '',
        latitude: '',
        longitude: '',
      };
    } else {
      const saved =
        queryClient.getQueryData<BusAlert[]>(['alerts', 'list'])?.find((a) => a.id === alertId) ??
        (
          await queryClient.fetchQuery({ queryKey: ['alerts', 'list'], queryFn: () => getAlerts() })
        ).find((a) => a.id === alertId);
      const latitude = saved?.stop.latitude ?? Number(payload.latitude),
        longitude = saved?.stop.longitude ?? Number(payload.longitude);
      const stationId =
        saved?.stationId ?? (typeof payload.stationId === 'string' ? payload.stationId : '');
      if (!stationId || !Number.isFinite(latitude) || !Number.isFinite(longitude))
        throw new Error('알림 대상 정류장을 찾을 수 없습니다.');
      params = {
        stationId,
        latitude: String(latitude),
        longitude: String(longitude),
        notificationId: requestId,
        routeId: saved?.routeId ?? String(payload.routeId ?? ''),
        stationSeq: saved?.stationSeq === undefined ? '' : String(saved.stationSeq),
        subwayStationName: '',
        subwayLineName: '',
        subwayLineId: '',
      };
    }
    useAppStore.getState().finishAlertSelection();
    router.navigate({ pathname: '/', params });
    return true;
  } catch (error) {
    useAppStore
      .getState()
      .setAlertRuntimeError(
        error instanceof Error ? error.message : '알림 대상을 열지 못했습니다.',
      );
    return false;
  }
}
