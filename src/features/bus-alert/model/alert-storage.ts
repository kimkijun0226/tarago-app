/** @fileoverview 서버 알림의 마지막 사본을 SQLite 키값 저장소에 보관해 React 외부의 접근 감지 작업이 읽게 한다. */
import Storage from 'expo-sqlite/kv-store';
import type { BusAlert } from './bus-alert';

/** 백그라운드 작업은 React 캐시 없이 접근하므로 서버 설정의 마지막 사본만 기기에 보관한다. */
export async function cacheAlerts(alerts: BusAlert[]) {
  await Storage.setItem('tarago-alerts', JSON.stringify(alerts));
}

/** 백그라운드 작업이 읽을 마지막 서버 사본을 복원한다. 저장·파싱 오류는 호출자에게 전파한다. */
export async function readCachedAlerts(): Promise<BusAlert[]> {
  /** 백그라운드 감지가 사용할 직렬화된 마지막 알림 사본이며 없으면 빈 목록으로 복원한다. */
  const value = await Storage.getItem('tarago-alerts');
  return value ? JSON.parse(value) : [];
}
export { Storage as alertStorage };
