/** @fileoverview 화면과 알림 런타임이 공유하는 서버 상태 캐시. 모듈 범위의 단일 QueryClient로 화면 전환 후에도 결과를 재사용한다. */
import { QueryClient } from '@tanstack/react-query';

/**
 * 앱 화면 전체에서 서버 응답을 공유하는 TanStack Query 인스턴스.
 *
 * 일시적인 요청 오류에는 한 번만 재시도한다. 정류장 타일과 도착정보의
 * 캐시·폴링 시간은 각 기능의 Query에서 별도로 정의한다.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});
