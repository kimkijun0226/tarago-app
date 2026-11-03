import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '@/shared/api/client';
import { API_STORAGE_SCOPE } from '@/shared/api/config';
import { alertStorage } from './alert-storage';

export const RIDE_DONE = 'TARAGO_RIDE_DONE';
export const PAUSE_TODAY = 'TARAGO_PAUSE_TODAY';
export const SNOOZE_FIVE = 'TARAGO_SNOOZE_FIVE';
const TASK = 'tarago-notification-actions';
const PREFIX = `tarago-action-${API_STORAGE_SCOPE}-`;
let retrying: Promise<void> | undefined;

export type NotificationControl = Partial<
  Record<
    'time' | 'location',
    {
      pausedUntil?: string;
      snoozedUntil?: string;
    }
  >
>;

export function notificationPause(
  control: NotificationControl | undefined,
  kind: 'time' | 'location',
  now: number,
) {
  const state = control?.[kind];
  if (Date.parse(state?.pausedUntil ?? '') > now) return 'paused';
  if (Date.parse(state?.snoozedUntil ?? '') > now) return 'snoozed';
  return undefined;
}

/** 실패한 응답은 보안 저장소에 남겨 앱 복귀·다음 응답 때 다시 전송한다. */
export async function retryNotificationActions() {
  if (retrying) {
    await retrying;
    return retryNotificationActions();
  }
  retrying = (async () => {
    const keys = (await alertStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    let failed = false;
    for (const key of keys) {
      const saved = await SecureStore.getItemAsync(key);
      if (!saved) {
        await alertStorage.removeItem(key);
        continue;
      }
      const input = JSON.parse(saved) as {
        token: string;
        action: string;
        expiresAt: string;
        notificationId: string;
        requestedAt?: number;
      };
      let remove = Date.parse(input.expiresAt) <= Date.now();
      if (!remove) {
        try {
          await apiClient.post('/alerts/actions', {
            token: input.token,
            action: input.action,
            requestedAt: input.requestedAt,
          });
          remove = true;
          await Notifications.dismissNotificationAsync(input.notificationId);
        } catch (error) {
          // 서명 만료·삭제·설정 변경은 재시도해도 현재 예약에 적용할 수 없다.
          if (isAxiosError(error) && [400, 401, 404, 410].includes(error.response?.status ?? 0))
            remove = true;
          else failed = true;
        }
      }
      if (remove) {
        await SecureStore.deleteItemAsync(key);
        await alertStorage.removeItem(key);
      }
    }
    if (failed) throw new Error('알림 변경을 전송하지 못했어요. 연결되면 다시 시도해요.');
  })();
  try {
    await retrying;
  } finally {
    retrying = undefined;
  }
}

export async function handleNotificationAction(response: Notifications.NotificationResponse) {
  const action =
    response.actionIdentifier === PAUSE_TODAY
      ? 'pauseToday'
      : response.actionIdentifier === RIDE_DONE
        ? 'rideDone'
        : response.actionIdentifier === SNOOZE_FIVE
          ? 'snoozeFive'
          : undefined;
  if (!action) return false;
  // iOS forwards this response after its native request; sending twice can replay an old pause.
  if (Platform.OS === 'ios') return true;
  const data = response.notification.request.content.data;
  if (!data || typeof data.actionToken !== 'string' || typeof data.actionExpiresAt !== 'string')
    throw new Error('이 알림에서는 빠른 동작을 사용할 수 없어요.');
  const signature = data.actionToken.split('.')[1];
  if (!signature || !/^[\w-]{43}$/.test(signature)) throw new Error('알림 정보를 확인해주세요.');
  const key = `${PREFIX}${signature}-${action}`;
  await SecureStore.setItemAsync(
    key,
    JSON.stringify({
      token: data.actionToken,
      action,
      expiresAt: data.actionExpiresAt,
      notificationId: response.notification.request.identifier,
      requestedAt: Date.now(),
    }),
    { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY },
  );
  await alertStorage.setItem(key, 'pending');
  await retryNotificationActions();
  return true;
}

if (!TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask<Notifications.NotificationTaskPayload>(TASK, async ({ data, error }) => {
    if (error) {
      await alertStorage.setItem(
        'tarago-action-error',
        '알림 동작을 처리하지 못했어요. 앱을 열어 다시 확인해주세요.',
      );
      return;
    }
    if (!data || !('actionIdentifier' in data)) return;
    try {
      await handleNotificationAction(data);
    } catch (error) {
      await alertStorage.setItem(
        'tarago-action-error',
        error instanceof Error ? error.message : '알림 동작을 처리하지 못했어요.',
      );
    }
  });
}

export async function registerNotificationActions() {
  await Notifications.setNotificationCategoryAsync('taragoArrival', [
    ...(Platform.OS === 'ios'
      ? []
      : [
          {
            identifier: PAUSE_TODAY,
            buttonTitle: '오늘은 쉬어요',
            options: { opensAppToForeground: false },
          },
        ]),
    {
      identifier: RIDE_DONE,
      buttonTitle: '탔어요',
      options: { opensAppToForeground: false },
    },
    {
      identifier: SNOOZE_FIVE,
      buttonTitle: '5분 뒤 다시 알림',
      options: { opensAppToForeground: false },
    },
  ]);
  if (Platform.OS === 'android' && !(await TaskManager.isTaskRegisteredAsync(TASK)))
    await Notifications.registerTaskAsync(TASK);
}
