import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** 개발 중에는 메트로 호스트의 3000번 포트로 연결한다. */
function getApiBaseUrl() {
  if (!__DEV__) {
    return process.env.EXPO_PUBLIC_API_BASE_URL;
  }

  const hostUri = Constants.expoConfig?.hostUri;

  if (!hostUri) {
    throw new Error('메트로 주소가 없습니다. 개발 서버에 연결해주세요.');
  }

  const url = new URL(`http://${hostUri}`);

  if (Platform.OS === 'android' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    url.hostname = '10.0.2.2';
  }

  url.port = '3000';
  url.pathname = '/';
  url.search = '';
  url.hash = '';

  return url.origin;
}

/** 모든 API 요청에 사용하는 서버 주소다. */
export const API_BASE_URL = getApiBaseUrl();
