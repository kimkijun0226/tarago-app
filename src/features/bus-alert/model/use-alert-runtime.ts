import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { checkNearbyStops, preparePush, syncGeofences } from './alert-runtime';
import { alertStorage, cacheAlerts, readCachedAlerts } from './alert-storage';
import { useMapTabVisibility } from '@/components/map-tab-visibility';
import { useAlerts } from './use-alerts';
import { useMonitoringSessions } from './use-monitoring-sessions';
import type { BusAlert } from './bus-alert';
import { getAlerts } from '../api/alerts';

/** 감시 등록은 화면 수와 무관하게 루트에서 한 번 수행한다. */
export function useAlertRuntime() {
  const navigation = useRootNavigationState();
  const {begin,extend,stop} = useMonitoringSessions();
  const handledResponse = useRef<string|undefined>(undefined);
  const {data:alerts} = useAlerts();
  const {setMapTabHidden} = useMapTabVisibility();
  const queryClient = useQueryClient();
  const latest = useRef<BusAlert[]>([]);
  const [error,setError] = useState<string|null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let disposed = false;
    let subscription:Location.LocationSubscription|undefined;
    async function start() {
      try {
        const saved = alerts ?? await readCachedAlerts();
        if (disposed) return;
        latest.current = saved;
        if (alerts) await cacheAlerts(alerts);
        if (disposed) return;
        await syncGeofences(saved);
        if (disposed) return;
        setError(null);
        if (!saved.some(a => a.enabled && a.proximityEnabled)) return;
        subscription = await Location.watchPositionAsync({accuracy:Location.Accuracy.Balanced,timeInterval:10_000,distanceInterval:30},position => {
          void checkNearbyStops(position,latest.current).catch(() => setError('접근 알림에 실패했어요. 위치·알림 권한을 확인해주세요.'));
        });
        if (disposed) subscription.remove();
      } catch (e) { if (!disposed) setError(e instanceof Error ? e.message : '접근 감지를 시작하지 못했어요.'); }
    }
    void start();
    return () => { disposed=true; subscription?.remove(); };
  },[alerts]);
  useEffect(() => {
    if (Platform.OS === 'web' || !navigation?.key) return;
    async function open(response:Notifications.NotificationResponse) {
      const data = response.notification.request.content.data;
      if (!data) return;
      const id = response.notification.request.identifier;
      const responseKey = `${id}:${data.promptId ?? data.monitoringEndsAt ?? ''}:${response.actionIdentifier}`;
      if (handledResponse.current === responseKey || typeof data.alertId !== 'string') return;
      handledResponse.current=responseKey;
      setMapTabHidden(false);
      try {
        if (data.kind === 'proximity-prompt') {
          const savedAlerts = await queryClient.fetchQuery({queryKey:['alerts','list'],queryFn:()=>getAlerts()});
          const ids=Array.isArray(data.alertIds) ? data.alertIds.filter((value):value is string=>typeof value==='string') : [data.alertId];
          const sources=savedAlerts.filter(a=>ids.includes(a.id) && a.enabled && a.proximityEnabled);
          if(!sources.length)throw new Error('위치 기반 알림이 삭제되었거나 꺼져 있습니다.');
          if(response.actionIdentifier==='START_MONITORING') {
            for(const source of sources)await begin(source);
            router.navigate({pathname:'/alerts',params:{requestId:responseKey,monitoringId:sources[0].id,sourceAlertId:'',sourceAlertIds:'',alertId:'',stationId:'',routeId:''}});
          } else {
            router.navigate({pathname:'/alerts',params:{sourceAlertId:sources[0].id,sourceAlertIds:sources.map(a=>a.id).join(','),requestId:responseKey,alertId:'',stationId:'',routeId:''}});
          }
          await Notifications.clearLastNotificationResponseAsync();
          return;
        }
        if (data.kind === 'monitoring-extension') {
          const all = await queryClient.fetchQuery({queryKey:['alerts','list'],queryFn:()=>getAlerts()});
          const session = all.find(a=>a.id===data.alertId && a.enabled && a.monitoringSourceId && a.monitoringEndsAt===data.monitoringEndsAt);
          if (session) {
            if (response.actionIdentifier==='EXTEND_MONITORING') await extend(session);
            if (response.actionIdentifier==='STOP_MONITORING') await stop(session);
            router.navigate({pathname:'/alerts',params:{monitoringId:session.id,requestId:responseKey,sourceAlertId:'',sourceAlertIds:'',alertId:'',stationId:'',routeId:''}});
          }
          await Notifications.clearLastNotificationResponseAsync();
          return;
        }
        const hasStop = typeof data.stationId === 'string' && typeof data.latitude === 'number' && typeof data.longitude === 'number';
        const saved = hasStop ? undefined : (await queryClient.fetchQuery({queryKey:['alerts','list'],queryFn:()=>getAlerts()})).find(a => a.id === data.alertId);
        const latitude = saved?.stop.latitude ?? Number(data.latitude);
        const longitude = saved?.stop.longitude ?? Number(data.longitude);
        const stationId = saved?.stationId ?? data.stationId;
        if (typeof stationId !== 'string' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('알림의 정류장 정보를 찾을 수 없습니다.');
        router.navigate({pathname:'/',params:{stationId,latitude:String(latitude),longitude:String(longitude),notificationId:id}});
        await Notifications.clearLastNotificationResponseAsync();
      } catch (e) {
        handledResponse.current=undefined;
        setError(e instanceof Error ? e.message : '알림 정류장을 열지 못했어요.');
      }
    }
    const response = Notifications.getLastNotificationResponse();
    if (response) void open(response);
    const listener = Notifications.addNotificationResponseReceivedListener(response => { void open(response); });
    const tokenListener = Notifications.addPushTokenListener(token => { void preparePush(token).then(() => queryClient.invalidateQueries({queryKey:['alerts','push-status']})); });
    const appListener = AppState.addEventListener('change',state => {
      if (state !== 'active') return;
      void queryClient.invalidateQueries({queryKey:['alerts']});
      void alertStorage.getItem('tarago-proximity-error').then(setError);
    });
    return () => { listener.remove(); tokenListener.remove(); appListener.remove(); };
  },[queryClient,setMapTabHidden,navigation?.key,begin,extend,stop]);
  return error;
}
