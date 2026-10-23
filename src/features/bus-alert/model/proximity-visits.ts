/** @fileoverview 기기 영역 변화를 보관하고 실패한 이탈 요청을 다음 실행에서 다시 전달한다. */
import { isAxiosError } from 'axios';
import { useAppStore } from '@/shared/model/app-store';
import { API_STORAGE_SCOPE } from '@/shared/api/config';
import { setAlertProximity } from '../api/alerts';
import { alertStorage } from './alert-storage';

type Visit = { inside: boolean; observedAt: string; synced: boolean };
const PREFIX = `tarago-proximity-visit:${API_STORAGE_SCOPE}:`;
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(run: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(run);
  queue = next;
  return next;
}

async function send(key: string, transport: 'bus' | 'subway', id: string, visit: Visit) {
  try {
    await setAlertProximity(transport, id, visit);
    await alertStorage.setItem(key, JSON.stringify({ ...visit, synced: true }));
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      await alertStorage.removeItem(key);
      return;
    }
    await alertStorage.setItem(
      'tarago-proximity-error',
      '위치 알림 상태를 전송하지 못했어요. 연결되면 다시 시도해요.',
    );
    throw error;
  }
}

/** 같은 알림의 진입·이탈 요청을 직렬화해 늦은 진입 응답이 이탈을 덮지 않게 한다. */
export function reportProximity(
  transport: 'bus' | 'subway',
  id: string,
  inside: boolean,
  force = false,
  observedAt = Date.now(),
) {
  if (!Number.isFinite(observedAt))
    return Promise.reject(new Error('위치 관측 시간을 확인해주세요.'));
  // 네트워크 전송 대기·실패와 관계없이 이탈 즉시 화면 조회를 중단한다.
  useAppStore.getState().setProximityVisit(`${transport}:${id}`, inside, observedAt);
  return serialize(async () => {
    const key = `${PREFIX}${transport}:${id}`;
    const previous = JSON.parse((await alertStorage.getItem(key)) ?? 'null') as Visit | null;
    if (previous && observedAt < Date.parse(previous.observedAt)) return;
    if (previous && observedAt === Date.parse(previous.observedAt) && previous.inside !== inside)
      return;
    if (
      (previous?.inside === inside && previous.synced && !force) ||
      (!previous && !inside && !force)
    ) {
      // 같은 상태도 최신 관측 시각은 남겨 늦게 도착한 반대 상태를 거부한다.
      await alertStorage.setItem(
        key,
        JSON.stringify({ inside, observedAt: new Date(observedAt).toISOString(), synced: true }),
      );
      return;
    }
    const visit: Visit = {
      inside,
      observedAt: new Date(observedAt).toISOString(),
      synced: false,
    };
    // 이탈을 먼저 기기에 기록해야 네트워크 실패 후에도 재전송할 수 있다.
    await alertStorage.setItem(key, JSON.stringify(visit));
    await send(key, transport, id, visit);
  });
}

export function retryProximityReports() {
  return serialize(async () => {
    for (const key of await alertStorage.getAllKeys()) {
      if (!key.startsWith(PREFIX)) continue;
      const visit = JSON.parse((await alertStorage.getItem(key)) ?? 'null') as Visit | null;
      if (!visit || visit.synced || visit.inside) continue;
      const [transport, id] = key.slice(PREFIX.length).split(':');
      if (transport !== 'bus' && transport !== 'subway') continue;
      await send(key, transport, id, visit);
    }
  });
}
