import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { deleteSubwayAlert, getSubwayAlerts, saveSubwayAlert } from '../api/subway-alerts';
import type { SubwayAlert, SubwayAlertInput } from './subway-alert';

export function useSubwayAlerts() {
  return useQuery({ queryKey: ['subway-alerts'], queryFn: ({ signal }) => getSubwayAlerts(signal), enabled: Platform.OS !== 'web' });
}
/** 저장 후 서버 목록을 다시 확인해 다른 화면에서도 최신 예약을 표시한다. */
export function useSubwayAlertMutations() {
  const client = useQueryClient();
  const save = useMutation({ mutationFn: ({ input, id }: { input: SubwayAlertInput; id?: string }) => saveSubwayAlert(input, id),
    onSuccess: async alert => {
      client.setQueryData<SubwayAlert[]>(['subway-alerts'], current => [alert, ...(current ?? []).filter(a => a.id !== alert.id)]);
      await client.invalidateQueries({ queryKey: ['subway-alerts'] });
    } });
  const remove = useMutation({ mutationFn: deleteSubwayAlert, onSuccess: async (_, id) => {
    client.setQueryData<SubwayAlert[]>(['subway-alerts'], current => (current ?? []).filter(a => a.id !== id));
    await client.invalidateQueries({ queryKey: ['subway-alerts'] });
  } });
  return { save, remove };
}
