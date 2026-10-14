import * as Notifications from 'expo-notifications';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAlerts, useAlertMutations } from './use-alerts';
import { ensureNotificationPermission, preparePush } from './alert-runtime';
import { immediateMonitoring } from './immediate-monitoring';
import type { BusAlert } from './bus-alert';

/** 일회성 감시의 생성·연장·중지와 OS의 만료 확인 알림을 함께 관리한다. */
export function useMonitoringSessions() {
  const {data:alerts=[]} = useAlerts();
  const client = useQueryClient();
  const {save:{mutateAsync:save},remove:{mutateAsync:remove}} = useAlertMutations();
  const activate = useCallback(async (source:BusAlert, existing?:BusAlert) => {
    await ensureNotificationPermission();
    const warning = await preparePush();
    if (warning) throw new Error(warning);
    const session = await save({id:existing?.id,input:{...immediateMonitoring(source),monitoringSourceId:source.monitoringSourceId ?? source.id}});
    try {
      await Notifications.setNotificationCategoryAsync('TARAGO_EXTENSION',[
        {identifier:'EXTEND_MONITORING',buttonTitle:'1시간 연장',options:{opensAppToForeground:true}},
        {identifier:'STOP_MONITORING',buttonTitle:'종료',options:{opensAppToForeground:true}},
      ]);
      await Notifications.scheduleNotificationAsync({identifier:`monitor:${session.id}`,content:{
        title:`${session.busNumber}번 버스 · ${session.stop.name}`,body:'1시간 감시가 끝났습니다. 1시간 더 연장할까요?',
        categoryIdentifier:'TARAGO_EXTENSION',sound:'default',data:{kind:'monitoring-extension',alertId:session.id,monitoringEndsAt:session.monitoringEndsAt}},
        trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(session.monitoringEndsAt!)}});
    } catch (e) {
      // 연장 안내를 예약하지 못한 감시가 남지 않도록 저장을 되돌린다.
      if (existing) await save({id:existing.id,input:existing});
      else await remove(session.id);
      throw e;
    }
    return session;
  },[save,remove]);
  const begin = useCallback((source:BusAlert) => activate(source,client.getQueryData<BusAlert[]>(['alerts','list'])?.find(a=>a.monitoringSourceId===source.id)),[activate,client]);
  const extend = useCallback((session:BusAlert) => activate(session,session),[activate]);
  const stop = useCallback(async (session:BusAlert) => {
    await save({id:session.id,input:{...session,enabled:false}});
    await Notifications.cancelScheduledNotificationAsync(`monitor:${session.id}`);
  },[save]);
  return {sessions:alerts.filter(a=>a.monitoringSourceId && a.enabled),begin,extend,stop};
}
