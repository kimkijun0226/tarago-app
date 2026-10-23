import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '@/shared/api/config';
import { alertStorage } from './alert-storage';
const key = ['alerts', 'history-read', API_BASE_URL] as const;
const storageKey = `tarago-history-read:${API_BASE_URL}`;
let saving: Promise<unknown> = Promise.resolve();
export function useHistoryReadCursor() {
  return useQuery({
    queryKey: key,
    queryFn: async () => (await alertStorage.getItem(storageKey)) ?? '0',
    staleTime: Infinity,
  });
}
/** 내역 화면에서 확인한 최신 ID까지만 읽음 처리하며 늦은 응답으로 되돌리지 않는다. */
export function useMarkHistoryRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => {
      const next = saving
        .catch(() => undefined)
        .then(async () => {
          const old = (await alertStorage.getItem(storageKey)) ?? '0';
          const cursor = BigInt(id) > BigInt(old) ? id : old;
          await alertStorage.setItem(storageKey, cursor);
          return cursor;
        });
      saving = next;
      return next;
    },
    onSuccess: (cursor) => client.setQueryData(key, cursor),
  });
}
