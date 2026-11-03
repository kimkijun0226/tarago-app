import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

export type VoiceProfile =
  | 'clear-young'
  | 'soft-cute'
  | 'calm-woman'
  | 'announcer-woman'
  | 'warm-man'
  | 'system-female'
  | 'system-male';

export type NotificationVoice = {
  provider: 'qwen3' | 'system';
  profile: VoiceProfile;
  key: string;
  phrase: string;
  maxMinutes: number;
  schedule: boolean;
  readyPlatform?: 'ios' | 'android';
  bundledVersion?: 1;
};

export type PreparedVoice = {
  key: string;
  authorization: string;
  sounds: { source: 'r' | 's'; time: string; url: string }[];
};

export type SystemVoiceProfile = 'system-female' | 'system-male';
export type SystemVoiceInput = {
  key: string;
  profile: SystemVoiceProfile;
  phrase: string;
  maxMinutes: number;
  schedule: boolean;
};
export type SystemVoiceAvailability = Record<SystemVoiceProfile, boolean>;
type NativeVoice = {
  systemAvailability: () => Promise<SystemVoiceAvailability>;
  prepareSystem: (voice: SystemVoiceInput) => Promise<void>;
  playSystemPreview: (voice: SystemVoiceInput) => Promise<void>;
  apiVersion: number;
  bundledVersion?: number;
  previewProfiles?: string[];
  prepare: (voice: PreparedVoice) => Promise<void>;
  playPreview: (url: string) => Promise<void>;
  stopPreview: () => Promise<void>;
  prune: (keys: string[]) => Promise<void>;
};
const native = requireOptionalNativeModule<NativeVoice>('TaraGoNotificationVoice');
// 작업 오류는 호출자에게 전달하고, 직전 작업이 실패해도 다음 작업은 실행한다.
let queue: Promise<void> = Promise.resolve();
let previewRequestId = 0;

/** 음원 준비와 미리 듣기를 직렬화하고 취소된 대기 재생은 건너뛴다. */
function queueVoicePreview(play: () => Promise<void>) {
  const request = ++previewRequestId;
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (request === previewRequestId) await play();
    });
  queue = task;
  return task;
}
export const supportsAnnouncerPreview =
  native?.previewProfiles?.includes('announcer-woman') === true;
export const supportsBundledNotificationVoice =
  Platform.OS === 'ios' && native?.bundledVersion === 1;
export const supportsSystemNotificationVoice = native !== null && native.apiVersion >= 3;
export const supportsNotificationVoice =
  native !== null &&
  native.apiVersion >= 2 &&
  (Platform.OS !== 'android' || Number(Platform.Version) >= 26);

/** 전경에서만 음성을 준비하며 종료 상태의 재생은 OS 알림 시스템이 담당한다. */
export function prepareNotificationVoice(voice: PreparedVoice) {
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (!native || !supportsNotificationVoice)
        throw new Error('음성 알림을 사용하려면 새 앱 빌드가 필요해요.');
      await native.prepare(voice);
    });
  queue = task;
  return task;
}
export function pruneNotificationVoices(keys: string[]) {
  const task = queue
    .catch(() => {})
    .then(async () => {
      await native?.prune(keys);
    });
  queue = task;
  return task;
}

export async function playVoicePreview(url: string) {
  if (!supportsNotificationVoice || !native) throw new Error('새 앱 빌드가 필요해요.');
  await queueVoicePreview(() => native.playPreview(url));
}
export async function stopVoicePreview() {
  previewRequestId++;
  if (supportsNotificationVoice) await native?.stopPreview();
}

export async function systemVoiceAvailability(): Promise<SystemVoiceAvailability> {
  if (!native || native.apiVersion < 3) return { 'system-female': false, 'system-male': false };
  return native.systemAvailability();
}
export function prepareSystemVoice(voice: NotificationVoice) {
  const task = queue
    .catch(() => {})
    .then(async () => {
      if (!native || native.apiVersion < 3 || !voice.profile.startsWith('system-'))
        throw new Error('기기 기본 음성을 사용하려면 새 앱 빌드가 필요해요.');
      const available = await native.systemAvailability();
      if (!available[voice.profile as SystemVoiceProfile])
        throw new Error(
          '이 기기에는 선택한 성별의 한국어 기본 음성이 없어요. 다른 음성을 선택해주세요.',
        );
      await native.prepareSystem({ ...voice, profile: voice.profile as SystemVoiceProfile });
    });
  queue = task;
  return task;
}
export async function playSystemVoicePreview(profile: SystemVoiceProfile, busNumber?: string) {
  if (!native || native.apiVersion < 3) throw new Error('새 앱 빌드가 필요해요.');
  const number = busNumber?.trim() || '505';
  if (!/^[가-힣A-Za-z0-9 ·._()-]{1,30}$/.test(number)) throw new Error('버스 번호를 확인해주세요.');
  await queueVoicePreview(() =>
    native.playSystemPreview({
      key: '000000000000000000000000',
      profile,
      phrase: `${number}번 버스`,
      maxMinutes: 5,
      schedule: false,
    }),
  );
}
