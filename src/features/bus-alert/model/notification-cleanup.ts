import * as Notifications from 'expo-notifications';

/** 서버 삭제 후 해당 예약의 기기 예약·알림센터 표시만 정리한다. 다른 예약은 유지한다. */
export async function clearAlertNotifications(id: string) {
  const [scheduled, presented] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync(),
    Notifications.getPresentedNotificationsAsync(),
  ]);
  await Promise.all([
    ...scheduled
      .filter((notification) => notification.content.data?.alertId === id)
      .map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier),
      ),
    ...presented
      .filter((notification) => notification.request.content.data?.alertId === id)
      .map((notification) =>
        Notifications.dismissNotificationAsync(notification.request.identifier),
      ),
  ]);
}
