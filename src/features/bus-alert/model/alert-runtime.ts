/** @fileoverview React 외부에서도 실행되는 접근 감지 작업과 네이티브 권한·푸시·지오펜스 경계를 연결한다. */
import {
  subwayProximityRegions,
  handleSubwayEntry,
  handleSubwayExit,
} from '@/features/subway/model/subway-proximity';
import { readCachedSubwayAlerts } from '@/features/subway/model/subway-alert-storage';
import type { SubwayAlert } from '@/features/subway/model/subway-alert';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { registerPushToken } from '../api/alerts';
import { alertStorage, readCachedAlerts } from './alert-storage';
import type { BusAlert } from './bus-alert';
import { reportProximity, retryProximityReports } from './proximity-visits';

/** TaskManager와 지오펜스 등록이 같은 백그라운드 작업을 가리키게 하는 고정 식별자다. */
const TASK = 'tarago-stop-proximity';

/** Android 버스 알림이 사용할 중요도·소리 설정 채널 식별자다. */
const CHANNEL = 'bus-arrivals';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** 알림별 반경을 분리해야 같은 정류장의 서로 다른 반경에서도 이탈을 감지한다. */
function busRegions(alerts: BusAlert[]) {
  return alerts
    .filter((a) => a.enabled && a.proximityEnabled && !a.monitoringSourceId)
    .map((a) => ({
      identifier: `bus:${a.id}`,
      latitude: a.stop.latitude,
      longitude: a.stop.longitude,
      radius: a.radius,
      notifyOnEnter: true,
      notifyOnExit: true,
    }));
}

export async function handleStopEntry(identifier: string, force = false, observedAt = Date.now()) {
  const id = identifier.slice('bus:'.length);
  const alert = (await readCachedAlerts()).find((a) => a.id === id);
  if (!alert) return;
  await reportProximity(
    'bus',
    id,
    Boolean(alert.enabled && alert.proximityEnabled),
    force,
    observedAt,
  );
}

export async function handleStopExit(identifier: string, observedAt = Date.now()) {
  await reportProximity('bus', identifier.slice('bus:'.length), false, false, observedAt);
}

if (!TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask<{
    eventType: Location.LocationGeofencingEventType;
    region: Location.LocationRegion;
  }>(TASK, async ({ data, error }) => {
    if (error) {
      await alertStorage.setItem(
        'tarago-proximity-error',
        '접근 감지에 실패했어요. 위치 권한을 확인해주세요.',
      );
      console.warn('정류소 접근 감지 실패', error.message);
      return;
    }
    if (!data?.region.identifier) return;
    try {
      if (data.region.identifier.startsWith('subway:')) {
        if (data.eventType === Location.LocationGeofencingEventType.Enter)
          await handleSubwayEntry(data.region.identifier);
        else await handleSubwayExit(data.region.identifier);
        return;
      }
      if (data.eventType === Location.LocationGeofencingEventType.Enter)
        await handleStopEntry(data.region.identifier);
      else await handleStopExit(data.region.identifier);
    } catch (error) {
      await alertStorage.setItem(
        'tarago-proximity-error',
        '접근 알림을 보내지 못했어요. 앱에서 다시 설정해주세요.',
      );
      console.warn(
        '정류소 접근 알림 실패',
        error instanceof Error ? error.message : 'unknown error',
      );
    }
  });
}

/** 접근 알림 동작과 Android 채널을 준비하고 알림 권한 거절을 오류로 전달한다. */
export async function ensureNotificationPermission() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: '버스 도착 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
    await Notifications.setNotificationChannelAsync('subway-arrivals', {
      name: '지하철 도착 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  /** OS 알림 권한 요청 결과로, 거절되면 설정 저장 흐름에 이유를 전달한다. */
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new Error('기기 설정에서 TaraGo의 알림 권한을 허용해주세요.');
}

/** 위치 서비스·전경·백그라운드 권한과 작업 실행 가능 여부를 확인한다. */
export async function ensureProximityPermission() {
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error('기기의 위치 서비스를 켜주세요.');

  /** 전경 위치 권한의 현재·요청 결과이며 배경 권한보다 먼저 확보해야 한다. */
  let foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) throw new Error('정류소 접근 알림을 위해 위치 권한이 필요해요.');

  /** 백그라운드 위치 허용 여부로, 접근 감지 권한 요청과 영역 등록 가능 여부를 판단한다. */
  let background = await Location.getBackgroundPermissionsAsync();
  if (!background.granted) {
    await Location.requestBackgroundPermissionsAsync();
    background = await Location.getBackgroundPermissionsAsync();
  }
  if (!background.granted)
    throw new Error(
      '위치 권한을 항상 허용해주세요. Android에서는 위치 권한 설정에서 모든 시간 허용을 선택해주세요.',
    );
  if (!(await TaskManager.isAvailableAsync()))
    throw new Error('접근 알림은 새 개발 빌드에서 사용할 수 있어요.');
}

/** 원격 푸시 준비 실패는 저장 자체를 막지 않고 UI에서 준비 상태로 표시한다. */
export async function preparePush(
  devicePushToken?: Notifications.DevicePushToken,
): Promise<string | null> {
  if (!Device.isDevice)
    return '예약 푸시 알림은 실기기에서 설정해주세요. 시뮬레이터에서는 화면과 접근 알림을 확인할 수 있어요.';

  /** Expo 푸시 토큰이 연결될 EAS 프로젝트 ID로 앱 설정·빌드 설정·공개 환경 설정 순서로 찾는다. */
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  if (!projectId) return '예약 알림을 받으려면 EAS 프로젝트 연결과 APNs/FCM 푸시 설정이 필요해요.';
  try {
    // 리스너가 전달한 토큰을 사용해야 네이티브 토큰 요청이 리스너를 다시 실행하지 않는다.
    /** 현재 네이티브 토큰에 대응하는 Expo 푸시 토큰으로 서버 기기 등록에 전달한다. */
    const token = await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken });
    await registerPushToken(token.data);
    return null;
  } catch (error) {
    console.warn('예약 푸시 등록 실패', error instanceof Error ? error.message : 'unknown error');
    return '예약 푸시를 등록하지 못했어요. 네트워크와 앱의 푸시 설정을 확인한 뒤 다시 연결해주세요.';
  }
}

/** 지오펜스 갱신을 순차 실행하기 위한 마지막 Promise로 이전 요청의 완료를 연결한다. */
let geofenceSync: Promise<void> = Promise.resolve();

/** 네이티브 영역 등록을 직렬화해 이전 설정이 새로운 감시를 덮어쓰지 않게 한다. */
export function syncGeofences(alerts: BusAlert[], subwayAlerts?: SubwayAlert[]) {
  /** 이전 등록 실패와 무관하게 이번 목록을 순서대로 적용할 갱신 Promise다. */
  const next = geofenceSync.catch(() => undefined).then(() => applyGeofences(alerts, subwayAlerts));
  geofenceSync = next;
  return next;
}

/** 최신 알림을 네이티브 감시 영역에 적용하며 권한과 최대 영역 수를 검사한다. */
async function applyGeofences(alerts: BusAlert[], subwayAlerts?: SubwayAlert[]) {
  /** 알림마다 설정한 반경을 독립적으로 감지하는 네이티브 영역들이다. */
  const regions = [
    ...busRegions(alerts),
    ...subwayProximityRegions(subwayAlerts ?? (await readCachedSubwayAlerts())),
  ];

  /** 백그라운드 위치 허용 여부로, 접근 감지 권한 요청과 영역 등록 가능 여부를 판단한다. */
  const background = await Location.getBackgroundPermissionsAsync();
  // 위치 알림이 없으면 백그라운드 권한 자체를 요구하지 않는다.
  if (!background.granted) {
    if (!regions.length) return;
    throw new Error('정류소 접근 알림이 중지됐어요. 위치 권한을 항상 허용해주세요.');
  }

  /** 등록된 작업이 있는 경우에만 감시 해제를 호출하기 위한 OS 상태다. */
  const registered = await Location.hasStartedGeofencingAsync(TASK);
  if (!regions.length) {
    if (registered) await Location.stopGeofencingAsync(TASK);
    return;
  }
  if (regions.length > 20)
    throw new Error('접근 알림은 버스·지하철을 합쳐 최대 20개까지 설정할 수 있어요.');
  await Location.startGeofencingAsync(TASK, regions);
  await alertStorage.removeItem('tarago-proximity-error');
}

/** 전경에서도 실제 관측 시각과 알림별 반경으로 진입·이탈을 판정한다. */
export async function checkNearbyStops(
  position: Location.LocationObject,
  alerts: BusAlert[],
  subwayAlerts?: SubwayAlert[],
  force = false,
) {
  if (position.coords.accuracy !== null && position.coords.accuracy > 100) return;
  const updates: Promise<unknown>[] = [];
  for (const region of [
    ...busRegions(alerts),
    ...subwayProximityRegions(subwayAlerts ?? (await readCachedSubwayAlerts())),
  ]) {
    /** 위도 차이를 미터 단위 남북 거리로 근사한 값이다. */
    const north = (position.coords.latitude - region.latitude) * 111_320;

    /** 위도에 따른 경도 간격을 보정한 미터 단위 동서 거리다. */
    const east =
      (position.coords.longitude - region.longitude) *
      111_320 *
      Math.cos((region.latitude * Math.PI) / 180);

    /** 정류소 중심과 현재 위치의 근사 거리를 설정 반경과 비교한다. */
    const distance = Math.hypot(north, east);
    if (distance <= region.radius) {
      if (region.identifier.startsWith('subway:'))
        updates.push(handleSubwayEntry(region.identifier, force, position.timestamp));
      else updates.push(handleStopEntry(region.identifier, force, position.timestamp));
    } else if (distance > region.radius) {
      if (region.identifier.startsWith('subway:'))
        updates.push(handleSubwayExit(region.identifier, position.timestamp));
      else updates.push(handleStopExit(region.identifier, position.timestamp));
    }
  }
  const results = await Promise.allSettled(updates);
  await retryProximityReports();
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
