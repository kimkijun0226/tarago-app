/** @fileoverview TanStack Query가 알림 서버 상태를 소유하고 변경 성공 시 기기 사본과 쿼리 캐시를 동기화한다. */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteAlert, getAlerts, getPushStatus, saveAlert } from '../api/alerts';
import { cacheAlerts, readCachedAlerts } from './alert-storage';
import type { BusAlert, BusAlertInput } from './bus-alert';

/** 네이티브 앱의 알림 목록을 공유 쿼리 캐시로 조회한다. */
export function useAlerts() {
  return useQuery({
    queryKey: ['alerts', 'list'],
    queryFn: ({ signal }) => getAlerts(signal),
  });
}

/** 네이티브 기기의 푸시 연결 상태를 별도 쿼리로 조회한다. */
export function usePushStatus() {
  return useQuery({
    queryKey: ['alerts', 'push-status'],
    queryFn: getPushStatus,
  });
}

/** 저장·삭제 성공을 서버 캐시와 백그라운드용 기기 사본에 반영하는 변이를 제공한다. */
export function useAlertMutations() {
  /** 알림 쿼리의 조회 취소·갱신을 수행할 공유 QueryClient다. */
  const client = useQueryClient();

  /** QueryClient가 같으면 변이 훅이 같은 함수를 재사용하도록 참조를 유지한다. 기기 저장을 마친 뒤 화면 캐시를 갱신한다. */
  const updateCache = useCallback(
    async (change: (alerts: BusAlert[]) => BusAlert[]) => {
      /** 화면 쿼리 캐시를 우선하고 없으면 기기 사본을 읽어 변이 반영의 기준 목록을 얻는다. */
      const current =
        client.getQueryData<BusAlert[]>(['alerts', 'list']) ?? (await readCachedAlerts());

      /** 저장·삭제를 적용한 목록이며 기기 저장 성공 후 화면 캐시에 반영한다. */
      const next = change(current);
      await cacheAlerts(next);
      client.setQueryData(['alerts', 'list'], next);
      void client.invalidateQueries({ queryKey: ['alerts'] });
    },
    [client],
  );

  /** 늦은 목록 응답이 저장 결과를 덮어쓰지 않도록 변이 시작 전에 목록 조회를 취소한다. client가 같으면 참조를 유지한다. */
  const cancel = useCallback(
    () => client.cancelQueries({ queryKey: ['alerts', 'list'] }),
    [client],
  );

  /** 서버 저장 성공을 기기 사본과 쿼리 캐시에 반영하는 변이다. */
  const save = useMutation({
    onMutate: cancel,
    mutationFn: ({ input, id }: { input: BusAlertInput; id?: string }) => saveAlert(input, id),
    onSuccess: (alert) =>
      updateCache((current) => [alert, ...current.filter((a) => a.id !== alert.id)]),
  });

  /** 서버 삭제 성공을 기기 사본과 쿼리 캐시에 반영하는 변이다. */
  const remove = useMutation({
    onMutate: cancel,
    mutationFn: deleteAlert,
    onSuccess: (_, id) => updateCache((current) => current.filter((a) => a.id !== id)),
  });
  return { save, remove };
}
