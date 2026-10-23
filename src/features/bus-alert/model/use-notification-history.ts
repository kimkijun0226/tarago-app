import { useInfiniteQuery } from '@tanstack/react-query';
import { getNotificationHistory } from '../api/alerts';
/** 발송 내역의 페이지·새로고침·오류는 Query가 소유한다. */
export function useNotificationHistory() {
  return useInfiniteQuery({
    queryKey: ['alerts', 'history'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => getNotificationHistory(pageParam, signal),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: false,
  });
}
