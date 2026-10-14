import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { registerPushToken } from '../api/alerts';
import { alertStorage, readCachedAlerts } from './alert-storage';
import { proximityMessage, proximityRegions, shouldNotifyVisit, type BusAlert } from './bus-alert';
import { getBusArrivals, type BusArrival } from '@/features/bus-stop/api/get-bus-arrivals';
import { queryClient } from '@/shared/lib/query-client';

const TASK = 'tarago-stop-proximity';
const CHANNEL = 'bus-arrivals';
const pendingStops = new Set<string>();

/** 알림을 펼쳤을 때 사용자 동의로 감시를 시작하거나 설정 화면을 열 수 있다. */
async function registerProximityActions() {
  await Notifications.setNotificationCategoryAsync('TARAGO_PROXIMITY',[
    {identifier:'START_MONITORING',buttonTitle:'실시간 알림 시작 (1시간)',options:{opensAppToForeground:true}},
    {identifier:'OPEN_SETTINGS',buttonTitle:'설정하기',options:{opensAppToForeground:true}},
  ]);
}

Notifications.setNotificationHandler({ handleNotification: async () => ({
  shouldShowBanner:true, shouldShowList:true, shouldPlaySound:true, shouldSetBadge:false,
}) });

/** 정류장 접근 시 감시를 자동 시작하지 않고 사용자에게 1시간 감시를 제안한다. */
export async function handleStopEntry(stationId: string) {
  if (pendingStops.has(stationId)) return;
  pendingStops.add(stationId);
  try {
    const alerts = await readCachedAlerts();
    const day = new Date(Date.now()+9*60*60_000).getUTCDay();
    const matching = [...new Map(alerts.filter(a => a.stop.id === stationId && a.enabled && a.proximityEnabled && a.days.includes(day)
      && !alerts.some(session=>session.monitoringSourceId && session.stationId===a.stationId && session.routeId===a.routeId && session.stationSeq===a.stationSeq && session.enabled && Date.parse(session.monitoringEndsAt ?? '')>Date.now()))
      .map(a=>[`${a.routeId}:${a.stationSeq ?? ''}`,a])).values()];
    const alert = matching[0];
    if (!alert) return;
    const state = JSON.parse(await alertStorage.getItem(`visit:${stationId}`) ?? '{}') as { inside?:boolean; lastSent?:number };
    if (!shouldNotifyVisit(state,Date.now())) return;
    await registerProximityActions();
    let arrivals:BusArrival[]=[];
    try {
      arrivals=await queryClient.fetchQuery({queryKey:['bus-stops',stationId,'arrivals'],
        queryFn:({signal})=>getBusArrivals({stationId,signal}),staleTime:10_000,retry:false});
    } catch(error) {
      console.warn('접근 알림 도착정보 조회 실패',error instanceof Error ? error.message : 'unknown');
      await alertStorage.setItem('tarago-proximity-error','접근 알림의 도착정보를 조회하지 못했어요. 연결 상태를 확인해주세요.');
    }
    const latest=await readCachedAlerts();
    const valid=matching.filter(selected=>latest.some(a=>a.id===selected.id && a.enabled && a.proximityEnabled && a.days.includes(day)));
    if(!valid.length)return;
    const summary=valid.map(selected=>proximityMessage(arrivals,selected)).join('\n\n');
    await Notifications.scheduleNotificationAsync({identifier:`proximity:${stationId}`,content:{title:`${alert.stop.name} 정류소 근처입니다`,
      body:`${summary}\n\n실시간 도착 알림을 1시간 동안 시작할까요?`,categoryIdentifier:'TARAGO_PROXIMITY',
      sound:'default',data:{kind:'proximity-prompt',promptId:String(Date.now()),alertId:valid[0].id,alertIds:valid.map(a=>a.id),stationId}},
      trigger:Platform.OS==='android' ? {channelId:CHANNEL} : null});
    await alertStorage.setItem(`visit:${stationId}`,JSON.stringify({inside:true,lastSent:Date.now()}));
  } finally { pendingStops.delete(stationId); }
}
export async function handleStopExit(stationId:string) {
  const state = JSON.parse(await alertStorage.getItem(`visit:${stationId}`) ?? '{}');
  await alertStorage.setItem(`visit:${stationId}`,JSON.stringify({...state,inside:false}));
}

if (!TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask<{eventType:Location.LocationGeofencingEventType;region:Location.LocationRegion}>(TASK,async ({data,error}) => {
    if (error) {
      await alertStorage.setItem('tarago-proximity-error','접근 감지에 실패했어요. 위치 권한을 확인해주세요.');
      console.warn('정류소 접근 감지 실패',error.message);
      return;
    }
    if (!data?.region.identifier) return;
    try {
      if (data.eventType === Location.LocationGeofencingEventType.Enter) await handleStopEntry(data.region.identifier);
      else await handleStopExit(data.region.identifier);
    } catch (error) {
      await alertStorage.setItem('tarago-proximity-error','접근 알림을 보내지 못했어요. 앱에서 다시 설정해주세요.');
      console.warn('정류소 접근 알림 실패',error instanceof Error ? error.message : 'unknown error');
    }
  });
}

export async function ensureNotificationPermission() {
  await registerProximityActions();
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL,{name:'버스 도착 알림',importance:Notifications.AndroidImportance.HIGH,sound:'default'});
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('기기 설정에서 TaraGo의 알림 권한을 허용해주세요.');
}
export async function ensureProximityPermission() {
  if (!(await Location.hasServicesEnabledAsync())) throw new Error('기기의 위치 서비스를 켜주세요.');
  let foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('정류소 접근 알림을 위해 위치 권한이 필요해요.');
  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) {
    await Location.requestBackgroundPermissionsAsync();
    background = await Location.getBackgroundPermissionsAsync();
  }
  if (!background.granted) throw new Error('위치 권한을 항상 허용해주세요. Android에서는 위치 권한 설정에서 모든 시간 허용을 선택해주세요.');
  if (!(await TaskManager.isAvailableAsync())) throw new Error('접근 알림은 새 개발 빌드에서 사용할 수 있어요.');
}

/** 원격 푸시 준비 실패는 저장 자체를 막지 않고 UI에서 준비 상태로 표시한다. */
export async function preparePush(devicePushToken?: Notifications.DevicePushToken):Promise<string|null> {
  if (!Device.isDevice) return '예약 푸시 알림은 실기기에서 설정해주세요. 시뮬레이터에서는 화면과 접근 알림을 확인할 수 있어요.';
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return '예약 알림을 받으려면 EAS 프로젝트 연결과 APNs/FCM 푸시 설정이 필요해요.';
  try {
    // 리스너가 전달한 토큰을 사용해야 네이티브 토큰 요청이 리스너를 다시 실행하지 않는다.
    const token = await Notifications.getExpoPushTokenAsync({projectId, devicePushToken});
    await registerPushToken(token.data);
    return null;
  } catch (error) {
    console.warn('예약 푸시 등록 실패', error instanceof Error ? error.message : 'unknown error');
    return '예약 푸시를 등록하지 못했어요. 네트워크와 앱의 푸시 설정을 확인한 뒤 다시 연결해주세요.';
  }
}

let geofenceSync:Promise<void> = Promise.resolve();
/** 네이티브 영역 등록을 직렬화해 이전 설정이 새로운 감시를 덮어쓰지 않게 한다. */
export function syncGeofences(alerts:BusAlert[]) {
  const next = geofenceSync.catch(() => undefined).then(() => applyGeofences(alerts));
  geofenceSync=next;
  return next;
}
async function applyGeofences(alerts:BusAlert[]) {
  const regions = proximityRegions(alerts);
  const registered = await Location.hasStartedGeofencingAsync(TASK);
  if (!regions.length) { if (registered) await Location.stopGeofencingAsync(TASK); return; }
  if (regions.length > 20) throw new Error('접근 알림은 최대 20개 정류소까지 설정할 수 있어요.');
  if (!(await Location.getBackgroundPermissionsAsync()).granted) throw new Error('정류소 접근 알림이 중지됐어요. 위치 권한을 항상 허용해주세요.');
  await Location.startGeofencingAsync(TASK,regions);
  await alertStorage.removeItem('tarago-proximity-error');
}

/** foreground에서도 현재 영역을 판정하며 50m 여유를 두어 GPS 흔들림을 줄인다. */
export async function checkNearbyStops(position:Location.LocationObject,alerts:BusAlert[]) {
  if (position.coords.accuracy !== null && position.coords.accuracy > 100) return;
  for (const region of proximityRegions(alerts)) {
    const north = (position.coords.latitude-region.latitude)*111_320;
    const east = (position.coords.longitude-region.longitude)*111_320*Math.cos(region.latitude*Math.PI/180);
    const distance = Math.hypot(north,east);
    if (distance <= region.radius) await handleStopEntry(region.identifier);
    else if (distance > region.radius+50) await handleStopExit(region.identifier);
  }
}
