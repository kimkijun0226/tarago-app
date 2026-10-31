import { Alert, Linking, Platform } from 'react-native';
import {
  alertErrorMessage,
  LocationPermissionError,
  NotificationPermissionError,
} from './alert-form';

export function notificationPermissionInstructions() {
  return Platform.OS === 'ios'
    ? '설정으로 이동한 뒤 ‘알림’에서 ‘알림 허용’을 켜주세요.'
    : '설정으로 이동한 뒤 ‘알림’에서 타라고의 알림을 허용해주세요.';
}

export function openNotificationSettings() {
  void Linking.openSettings().catch(() => {
    Alert.alert(
      '설정을 열지 못했어요',
      `휴대전화의 설정 앱에서 타라고를 찾아주세요.\n${notificationPermissionInstructions()}`,
    );
  });
}

/** 권한 거절만 설정 안내로 연결하고 저장·통신 오류는 원래 메시지를 보존한다. */
export function showAlertError(title: string, error: unknown) {
  if (error instanceof NotificationPermissionError) {
    Alert.alert('타라고의 알림 권한을 허용해주세요', notificationPermissionInstructions(), [
      { text: '나중에', style: 'cancel' },
      { text: '설정으로 이동', onPress: openNotificationSettings },
    ]);
    return;
  }
  if (error instanceof LocationPermissionError) {
    const instructions =
      Platform.OS === 'ios'
        ? '앱을 사용하지 않을 때도 근처에 도착하면 알려드리려면 위치 권한이 필요해요.\n설정 → 타라고 → 위치에서 ‘항상’을 선택해주세요.'
        : '앱을 사용하지 않을 때도 근처에 도착하면 알려드리려면 위치 권한이 필요해요.\n설정 → 타라고 → 권한 → 위치에서 ‘항상 허용’을 선택해주세요.';
    Alert.alert('위치 권한을 항상 허용해주세요', instructions, [
      { text: '나중에', style: 'cancel' },
      {
        text: '설정으로 이동',
        onPress: () => {
          void Linking.openSettings().catch(() =>
            Alert.alert('설정을 열지 못했어요', instructions),
          );
        },
      },
    ]);
    return;
  }
  Alert.alert(title, alertErrorMessage(error));
}
