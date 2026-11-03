import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { BusAlert } from './bus-alert';
import type { SubwayAlert } from '@/features/subway/model/subway-alert';
import {
  prepareVoiceJob,
  reportNotificationVoice,
  voiceDownloadInput,
  type VoicePreparation,
} from '../api/notification-voice';
import {
  prepareNotificationVoice,
  prepareSystemVoice,
  pruneNotificationVoices,
  supportsNotificationVoice,
  supportsBundledNotificationVoice,
  type NotificationVoice,
} from './notification-voice';

type Entry = {
  transport: 'bus' | 'subway';
  id: string;
  voice: NotificationVoice;
  enabled: boolean;
};

export function useNotificationVoice(
  bus: BusAlert[] | undefined,
  subway: SubwayAlert[] | undefined,
  onError: (error: string | null) => void,
) {
  const client = useQueryClient();
  const [sessionStarted, setSessionStarted] = useState(() => Date.now());
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      if (state === 'active') setSessionStarted(Date.now());
    });
    return () => subscription.remove();
  }, []);
  const { mutateAsync: ready } = useMutation({
    mutationFn: reportNotificationVoice,
  });
  const entries: Entry[] = [
    ...(bus ?? []).flatMap((alert) =>
      alert.notificationVoice
        ? [
            {
              transport: 'bus' as const,
              id: alert.id,
              enabled: alert.enabled && alert.voiceEnabled !== false,
              voice: alert.notificationVoice,
            },
          ]
        : [],
    ),
    ...(subway ?? []).flatMap((alert) =>
      alert.notificationVoice
        ? [
            {
              transport: 'subway' as const,
              id: alert.id,
              enabled: alert.enabled && alert.voiceEnabled !== false,
              voice: alert.notificationVoice,
            },
          ]
        : [],
    ),
  ];
  const jobs = useQueries({
    queries: entries.map((entry) => {
      const queryKey = ['voice-preparation', entry.transport, entry.id, entry.voice.key];
      return {
        queryKey,
        enabled:
          active && supportsNotificationVoice && entry.enabled && entry.voice.provider === 'qwen3',
        queryFn: ({ signal }: { signal: AbortSignal }) => {
          const previous = client.getQueryData<VoicePreparation>(queryKey);
          return prepareVoiceJob(
            { ...entry, key: entry.voice.key },
            !previous || ['failed', 'unavailable'].includes(previous.status),
            signal,
          );
        },
        retry: 2,
        staleTime: 30_000,
        refetchInterval: (query: { state: { data: VoicePreparation | undefined } }) => {
          if (!active || Date.now() - sessionStarted >= 10 * 60_000) return false;
          const preparation = query.state.data;
          if (['queued', 'generating'].includes(preparation?.status ?? '')) return 3000;
          if (preparation?.status === 'failed' && Number.isFinite(preparation.retryAfterMs))
            return Math.min(30_000, Math.max(5000, preparation.retryAfterMs!));
          return false;
        },
        refetchIntervalInBackground: false,
      };
    }),
  });
  const preparations = JSON.stringify(
    jobs.map((job) => (job.data?.status === 'ready' ? job.data : null)),
  );
  const signature = JSON.stringify(
    entries.map((entry) => ({ ...entry, voice: { ...entry.voice, readyPlatform: undefined } })),
  );
  const loaded = bus !== undefined && subway !== undefined;
  const available = bus !== undefined || subway !== undefined;
  useEffect(() => {
    if (
      !active ||
      !available ||
      !supportsNotificationVoice ||
      !['ios', 'android'].includes(Platform.OS)
    )
      return;
    let disposed = false;
    let running = false;
    const pending = JSON.parse(signature) as Entry[];
    const manifests = JSON.parse(preparations) as (VoicePreparation | null)[];
    async function prepare() {
      if (disposed || running || AppState.currentState !== 'active') return;
      running = true;
      const confirmed: Parameters<typeof reportNotificationVoice>[0][] = [];
      let channelLimitReached = false;
      try {
        if (loaded) await pruneNotificationVoices(pending.map((entry) => entry.voice.key));
        for (const [index, entry] of pending.entries()) {
          if (disposed || AppState.currentState !== 'active') return;
          const manifest = manifests[index];
          if (!entry.enabled) continue;
          const listKey = entry.transport === 'bus' ? ['alerts', 'list'] : ['subway-alerts'];
          const before = client
            .getQueryData<(BusAlert | SubwayAlert)[]>(listKey)
            ?.find((alert) => alert.id === entry.id);
          if (
            !before?.enabled ||
            before.voiceEnabled === false ||
            before.notificationVoice?.key !== entry.voice.key
          )
            continue;
          if (supportsBundledNotificationVoice && before.notificationVoice?.bundledVersion !== 1) {
            await ready({
              transport: entry.transport,
              id: entry.id,
              key: entry.voice.key,
              platform: 'ios',
              bundledVersion: 1,
              exactReady: false,
            });
            client.setQueryData<(BusAlert | SubwayAlert)[]>(listKey, (current) =>
              current?.map((alert) =>
                alert.id === entry.id && alert.notificationVoice?.key === entry.voice.key
                  ? {
                      ...alert,
                      notificationVoice: { ...alert.notificationVoice, bundledVersion: 1 },
                    }
                  : alert,
              ),
            );
          }
          if (disposed || AppState.currentState !== 'active') return;
          if (
            entry.voice.provider !== 'system' &&
            (!manifest || manifest.status !== 'ready' || manifest.key !== entry.voice.key)
          )
            continue;
          try {
            if (entry.voice.provider === 'system') await prepareSystemVoice(entry.voice);
            else if (manifest) await prepareNotificationVoice(await voiceDownloadInput(manifest));
          } catch (error) {
            if (entry.voice.provider === 'system') {
              onError(
                error instanceof Error
                  ? error.message
                  : '기기 기본 음성을 준비하지 못했어요. 다른 음성을 선택해주세요.',
              );
              continue;
            }
            if (
              typeof error === 'object' &&
              error !== null &&
              'code' in error &&
              error.code === 'E_VOICE_CHANNEL_LIMIT'
            ) {
              channelLimitReached = true;
              continue;
            }
            throw error;
          }
          if (disposed || AppState.currentState !== 'active') return;
          const key = entry.transport === 'bus' ? ['alerts', 'list'] : ['subway-alerts'];
          const current = client
            .getQueryData<(BusAlert | SubwayAlert)[]>(key)
            ?.find((alert) => alert.id === entry.id);
          if (
            !current?.enabled ||
            current.voiceEnabled === false ||
            current.notificationVoice?.key !== entry.voice.key
          )
            continue;
          if (current.notificationVoice.readyPlatform !== Platform.OS) {
            const input = {
              transport: entry.transport,
              id: entry.id,
              key: entry.voice.key,
              platform: Platform.OS as 'ios' | 'android',
              ...(supportsBundledNotificationVoice
                ? { bundledVersion: 1 as const, exactReady: true }
                : {}),
            };
            await ready(input);
            confirmed.push(input);
          }
        }
        if (!disposed && loaded)
          await pruneNotificationVoices(pending.map((entry) => entry.voice.key));
      } catch (error) {
        if (!disposed && AppState.currentState === 'active') {
          onError(
            isAxiosError(error)
              ? '음성 준비 상태를 서버에 전송하지 못했어요. 연결되면 앱을 다시 열어주세요.'
              : '음성 알림을 내려받지 못했어요. 연결을 확인하고 앱을 다시 열어주세요.',
          );
          if (isAxiosError(error) && error.response?.status === 409) {
            void client.invalidateQueries({ queryKey: ['alerts', 'list'] });
            void client.invalidateQueries({ queryKey: ['subway-alerts'] });
          }
        }
      } finally {
        if (!disposed && channelLimitReached && AppState.currentState === 'active')
          onError('이 기기에 저장된 음성 알림이 많아 일부 알림은 기본 알림음으로 알려드려요.');
        // 음성마다 목록을 갱신해 위치 감시를 반복 재등록하지 않도록 결과를 모은다.
        if (!disposed && confirmed.length) {
          for (const transport of ['bus', 'subway'] as const) {
            const updates = confirmed.filter((input) => input.transport === transport);
            if (!updates.length) continue;
            const key = transport === 'bus' ? ['alerts', 'list'] : ['subway-alerts'];
            client.setQueryData<(BusAlert | SubwayAlert)[]>(key, (alerts) =>
              alerts?.map((alert) => {
                const input = updates.find(
                  (value) => value.id === alert.id && value.key === alert.notificationVoice?.key,
                );
                return input && alert.notificationVoice
                  ? {
                      ...alert,
                      notificationVoice: {
                        ...alert.notificationVoice,
                        readyPlatform: input.platform,
                      },
                    }
                  : alert;
              }),
            );
          }
        }
        running = false;
      }
    }
    void prepare();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void prepare();
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [active, available, loaded, signature, preparations, ready, client, onError]);
}
