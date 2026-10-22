/** @fileoverview 지하철 예약 알림의 Query 캐시와 저장·삭제 후 목록 동기화를 관리한다. */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteSubwayAlert, getSubwayAlerts, saveSubwayAlert } from '../api/subway-alerts';
import type { SubwayAlert, SubwayAlertInput } from './subway-alert';
import { cacheSubwayAlerts } from './subway-alert-storage';

/**
 * 기기 인증이 가능한 모바일에서만 예약 목록을 조회한다.
 * @returns 예약 목록의 Query 결과. 함수 참조 안정성은 Query 실행 조건이 아니므로 별도 useCallback을 두지 않는다.
 */
export function useSubwayAlerts() {
  return useQuery({
    queryKey: ['subway-alerts'],
    queryFn: async ({ signal }) => {
      const alerts = await getSubwayAlerts(signal);
      await cacheSubwayAlerts(alerts);
      return alerts;
    },
  });
}

/**
 * 저장·삭제 결과를 캐시에 즉시 반영하고 서버 목록을 다시 확인한다.
 * @returns 저장과 삭제 mutation. QueryClient를 공유하여 다른 화면도 최신 목록을 사용한다.
 */
export function useSubwayAlertMutations() {
  /** 예약 목록의 Query 캐시를 갱신·무효화할 공통 클라이언트다. */
  const client = useQueryClient();

  /** 저장 성공 결과를 예약 목록에 우선 반영하고 서버 목록도 재조회하는 mutation이다. */
  const save = useMutation({
    onMutate: () => client.cancelQueries({ queryKey: ['subway-alerts'] }),
    mutationFn: ({ input, id }: { input: SubwayAlertInput; id?: string }) =>
      saveSubwayAlert(input, id),
    onSuccess: async (alert) => {
      client.setQueryData<SubwayAlert[]>(['subway-alerts'], (current) => [
        alert,
        ...(current ?? []).filter((a) => a.id !== alert.id),
      ]);
      await cacheSubwayAlerts(client.getQueryData<SubwayAlert[]>(['subway-alerts']) ?? []);
      await client.invalidateQueries({ queryKey: ['subway-alerts'] });
    },
  });

  /** 삭제 성공한 예약을 캐시에서도 제거한 뒤 서버 목록을 확인하는 mutation이다. */
  const remove = useMutation({
    onMutate: () => client.cancelQueries({ queryKey: ['subway-alerts'] }),
    mutationFn: deleteSubwayAlert,
    onSuccess: async (_, id) => {
      client.setQueryData<SubwayAlert[]>(['subway-alerts'], (current) =>
        (current ?? []).filter((a) => a.id !== id),
      );
      await cacheSubwayAlerts(client.getQueryData<SubwayAlert[]>(['subway-alerts']) ?? []);
      await client.invalidateQueries({ queryKey: ['subway-alerts'] });
    },
  });
  return { save, remove };
}
