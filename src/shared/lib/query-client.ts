/** @fileoverview 화면과 알림 런타임이 공유하는 서버 상태 캐시. 모듈 범위의 단일 QueryClient로 화면 전환 후에도 결과를 재사용한다. */
import { useRecoveryStore } from '@/shared/model/recovery-store';
import { QueryCache, QueryClient } from '@tanstack/react-query';

/** 조회 실패는 해당 Query에서 처리하며, 시작·백그라운드 조회가 전체 화면을 잠그지 않는다. */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onSuccess: (data, query) => {
      if (query.queryKey[0] !== 'alerts' || query.queryKey[1] !== 'push-status') return;
      if (typeof data !== 'object' || data === null || !('ready' in data) || data.ready !== true) return;
      // 문의 화면에 있어도 서버가 연결 복구를 확인하면 안내를 해제한다.
      useRecoveryStore.getState().clear('bus-push');
      useRecoveryStore.getState().clear('subway-push');
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
});
