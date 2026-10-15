/** @fileoverview 루트에서 위치 감지와 알림 응답 구독을 실행하는 화면 없는 런타임 컴포넌트. */
import { useAlertRuntime } from '../model/use-alert-runtime';

/** Query·Router 아래에서 한 번 마운트되어 알림 구독을 유지한다. 오류 공유는 앱 스토어가 담당한다. */
export function AlertRuntime() {
  useAlertRuntime();
  return null;
}
