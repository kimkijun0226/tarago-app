import { apiClient } from '@/shared/api/client';
import { API_BASE_URL } from '@/shared/api/config';
import { alertAuth } from './alerts';

export async function reportNotificationVoice(input: {
  transport: 'bus' | 'subway';
  id: string;
  key: string;
  platform: 'ios' | 'android';
  bundledVersion?: 1;
  exactReady?: boolean;
}) {
  await apiClient.put(
    `/alerts/voice/${input.transport}/${input.id}`,
    {
      key: input.key,
      platform: input.platform,
      apiVersion: 2,
      bundledVersion: input.bundledVersion,
      exactReady: input.exactReady,
    },
    await alertAuth(),
  );
}

export type VoicePreparation = {
  key: string;
  status: 'queued' | 'generating' | 'ready' | 'failed' | 'unavailable';
  retryAfterMs?: number;
  completed: number;
  total: number;
  sounds?: import('../model/notification-voice').PreparedVoice['sounds'];
};
export type VoiceCatalog = {
  available: boolean;
  profiles: {
    id: import('../model/notification-voice').VoiceProfile;
    name: string;
    description: string;
    provider?: 'qwen3' | 'system';
    previewUrl?: string;
  }[];
};

export function voiceUrl(path: string) {
  const base = new URL(API_BASE_URL ?? '');
  const url = new URL(path, base);
  if (url.origin !== base.origin || url.username || url.password || url.hash)
    throw new Error('음성 파일 주소가 올바르지 않아요.');
  return url.toString();
}
export async function getVoiceCatalog(signal?: AbortSignal) {
  const { data } = await apiClient.get<VoiceCatalog>('/alerts/voices', { signal });
  return {
    ...data,
    profiles: data.profiles.map((profile) => ({
      ...profile,
      previewUrl: profile.previewUrl ? voiceUrl(profile.previewUrl) : undefined,
    })),
  };
}
export async function prepareVoiceJob(
  input: { transport: 'bus' | 'subway'; id: string; key: string },
  start: boolean,
  signal?: AbortSignal,
) {
  const config = { ...(await alertAuth()), signal };
  const path = `/alerts/voice/${input.transport}/${input.id}/prepare`;
  const { data } = start
    ? await apiClient.post<VoicePreparation>(path, { key: input.key }, config)
    : await apiClient.get<VoicePreparation>(path, { ...config, params: { key: input.key } });
  return data;
}
export async function voiceDownloadInput(preparation: VoicePreparation) {
  if (preparation.status !== 'ready' || !preparation.sounds?.length)
    throw new Error('음성 준비 중');
  return {
    key: preparation.key,
    authorization: (await alertAuth()).headers.Authorization,
    sounds: preparation.sounds.map((sound) => ({ ...sound, url: voiceUrl(sound.url) })),
  };
}

/** Preview the draft's route without saving an alert or accepting arbitrary speech. */
export async function getBusVoicePreview(
  profile: import('../model/notification-voice').VoiceProfile,
  busNumber: string,
  signal?: AbortSignal,
) {
  const { data } = await apiClient.post<{ url: string }>(
    `/alerts/voices/${profile}/preview`,
    { busNumber },
    { ...(await alertAuth()), signal, timeout: 120_000 },
  );
  return voiceUrl(data.url);
}
