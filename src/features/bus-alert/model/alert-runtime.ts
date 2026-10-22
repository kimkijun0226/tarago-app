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
import { proximityMessage, proximityRegions, shouldNotifyVisit, type BusAlert } from './bus-alert';
import { getBusArrivals, type BusArrival } from '@/features/bus-stop/api/get-bus-arrivals';
import { queryClient } from '@/shared/lib/query-client';

/** TaskManager와 지오펜스 등록이 같은 백그라운드 작업을 가리키게 하는 고정 식별자다. */
const TASK = 'tarago-stop-proximity';

/** Android 버스 알림이 사용할 중요도·소리 설정 채널 식별자다. */
const CHANNEL = 'bus-arrivals';

/** 같은 정류소의 전경·백그라운드 접근 처리가 겹칠 때 발송 작업의 중복 실행을 막는다. */
const pendingStops = new Set<string>();

/** 알림을 펼쳤을 때 사용자 동의로 감시를 시작하거나 설정 화면을 열 수 있다. */
async function registerProximityActions() {
  await Notifications.setNotificationCategoryAsync('TARAGO_PROXIMITY', [
    {
      identifier: 'START_MONITORING',
      buttonTitle: '실시간 알림 시작 (1시간)',
      options: { opensAppToForeground: true },
    },
    {
      identifier: 'OPEN_SETTINGS',
      buttonTitle: '설정하기',
      options: { opensAppToForeground: true },
    },
  ]);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** 정류장 접근 시 감시를 자동 시작하지 않고 사용자에게 1시간 감시를 제안한다. */
export async function handleStopEntry(stationId: string) {
  if (pendingStops.has(stationId)) return;
  pendingStops.add(stationId);
  try {
    /** 현재 기기에 저장된 서버 알림 목록으로, 필터와 감시 설정의 원본이다. */
    const alerts = await readCachedAlerts();

    /** 접근 알림의 반복 요일을 한국 시간 기준으로 판정하기 위한 요일 번호다. */
    const day = new Date(Date.now() + 9 * 60 * 60_000).getUTCDay();

    /** 현재 요일에 활성화되고 진행 중 감시가 없는 노선을 정류소·노선 순번별로 중복 제거한 목록이다. */
    const matching = [
      ...new Map(
        alerts
          .filter(
            (a) =>
              a.stop.id === stationId &&
              a.enabled &&
              a.proximityEnabled &&
              a.days.includes(day) &&
              !alerts.some(
                (session) =>
                  session.monitoringSourceId &&
                  session.stationId === a.stationId &&
                  session.routeId === a.routeId &&
                  session.stationSeq === a.stationSeq &&
                  session.enabled &&
                  Date.parse(session.monitoringEndsAt ?? '') > Date.now(),
              ),
          )
          .map((a) => [`${a.routeId}:${a.stationSeq ?? ''}`, a]),
      ).values(),
    ];

    /** 정류소 이름과 대표 알림 정보를 가져올 첫 번째 유효 설정이다. */
    const alert = matching[0];
    if (!alert) return;

    /** 영역 안팎 여부와 마지막 발송 시각을 복원해 재진입 중복 알림을 막는다. */
    const state = JSON.parse((await alertStorage.getItem(`visit:${stationId}`)) ?? '{}') as {
      inside?: boolean;
      lastSent?: number;
    };
    if (!shouldNotifyVisit(state, Date.now())) return;
    await registerProximityActions();

    /** 접근 안내에 넣을 도착정보이며 조회 실패 시에도 빈 목록으로 감시 제안을 구성한다. */
    let arrivals: BusArrival[] = [];
    try {
      arrivals = await queryClient.fetchQuery({
        queryKey: ['bus-stops', stationId, 'arrivals'],
        queryFn: ({ signal }) => getBusArrivals({ stationId, signal }),
        staleTime: 10_000,
        retry: false,
      });
    } catch (error) {
      console.warn(
        '접근 알림 도착정보 조회 실패',
        error instanceof Error ? error.message : 'unknown',
      );
      await alertStorage.setItem(
        'tarago-proximity-error',
        '접근 알림의 도착정보를 조회하지 못했어요. 연결 상태를 확인해주세요.',
      );
    }

    /** 네트워크 조회 중 사용자가 알림을 끌 수 있어 발송 직전에 다시 읽은 기기 사본이다. */
    const latest = await readCachedAlerts();

    /** 첫 조회 후에도 활성 상태와 반복 요일 조건을 유지하는 설정만 발송 대상으로 남긴다. */
    const valid = matching.filter((selected) =>
      latest.some(
        (a) => a.id === selected.id && a.enabled && a.proximityEnabled && a.days.includes(day),
      ),
    );
    if (!valid.length) return;

    /** 유효한 노선별 도착 요약을 빈 줄로 구분한 접근 안내 본문이다. */
    const summary = valid.map((selected) => proximityMessage(arrivals, selected)).join('\n\n');
    await Notifications.scheduleNotificationAsync({
      identifier: `proximity:${stationId}`,
      content: {
        title: `${alert.stop.name} 정류소 근처입니다`,
        body: `${summary}\n\n실시간 도착 알림을 1시간 동안 시작할까요?`,
        categoryIdentifier: 'TARAGO_PROXIMITY',
        sound: 'default',
        data: {
          kind: 'proximity-prompt',
          promptId: String(Date.now()),
          alertId: valid[0].id,
          alertIds: valid.map((a) => a.id),
          stationId,
        },
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
    });
    await alertStorage.setItem(
      `visit:${stationId}`,
      JSON.stringify({ inside: true, lastSent: Date.now() }),
    );
  } finally {
    pendingStops.delete(stationId);
  }
}

/** 영역 이탈만 기록하고 마지막 발송 시각은 유지해 재진입 쿨다운을 적용한다. */
export async function handleStopExit(stationId: string) {
  /** 영역 안팎 여부와 마지막 발송 시각을 복원해 재진입 중복 알림을 막는다. */
  const state = JSON.parse((await alertStorage.getItem(`visit:${stationId}`)) ?? '{}');
  await alertStorage.setItem(`visit:${stationId}`, JSON.stringify({ ...state, inside: false }));
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
  await registerProximityActions();
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
  /** 같은 정류소의 접근 알림을 합친 네이티브 감시 영역들이다. */
  const regions = [
    ...proximityRegions(alerts),
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
    throw new Error('접근 알림은 버스 정류소와 지하철역을 합쳐 최대 20곳까지 설정할 수 있어요.');
  await Location.startGeofencingAsync(TASK, regions);
  await alertStorage.removeItem('tarago-proximity-error');
}

/** foreground에서도 현재 영역을 판정하며 50m 여유를 두어 GPS 흔들림을 줄인다. */
export async function checkNearbyStops(
  position: Location.LocationObject,
  alerts: BusAlert[],
  subwayAlerts?: SubwayAlert[],
) {
  if (position.coords.accuracy !== null && position.coords.accuracy > 100) return;
  for (const region of [
    ...proximityRegions(alerts),
    ...subwayProximityRegions(subwayAlerts ?? (await readCachedSubwayAlerts())),
  ]) {
    /** 위도 차이를 미터 단위 남북 거리로 근사한 값이다. */
    const north = (position.coords.latitude - region.latitude) * 111_320;

    /** 위도에 따른 경도 간격을 보정한 미터 단위 동서 거리다. */
    const east =
      (position.coords.longitude - region.longitude) *
      111_320 *
      Math.cos((region.latitude * Math.PI) / 180);

    /** 정류소 중심과 현재 위치의 근사 거리로 진입 반경·이탈 여유 50m와 비교한다. */
    const distance = Math.hypot(north, east);
    if (distance <= region.radius) {
      if (region.identifier.startsWith('subway:')) await handleSubwayEntry(region.identifier);
      else await handleStopEntry(region.identifier);
    } else if (distance > region.radius + 50) {
      if (region.identifier.startsWith('subway:')) await handleSubwayExit(region.identifier);
      else await handleStopExit(region.identifier);
    }
  }
}
