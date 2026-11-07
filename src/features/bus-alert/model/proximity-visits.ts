/** @fileoverview 기기 영역 변화를 보관하고 실패한 이탈 요청을 다음 실행에서 다시 전달한다. */
import { isAxiosError } from 'axios';
import { useAppStore } from '@/shared/model/app-store';
import { API_STORAGE_SCOPE } from '@/shared/api/config';
import { setAlertProximity } from '../api/alerts';
import { alertStorage } from './alert-storage';

type Visit = { inside: boolean; observedAt: string; synced: boolean; reportedAt?: string };
const HEARTBEAT_INTERVAL_MS = 60_000;
export const PROXIMITY_OBSERVATION_TTL_MS = 180_000;
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
    await alertStorage.setItem(
      key,
      JSON.stringify({ ...visit, synced: true, reportedAt: visit.observedAt }),
    );
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
    const latest = useAppStore.getState().proximityVisits[`${transport}:${id}`];
    if (
      inside &&
      (Date.now() - observedAt >= PROXIMITY_OBSERVATION_TTL_MS ||
        (latest && (latest.observedAt > observedAt || !latest.inside)))
    )
      return;
    const previous = JSON.parse((await alertStorage.getItem(key)) ?? 'null') as Visit | null;
    if (previous && observedAt < Date.parse(previous.observedAt)) return;
    if (
      previous &&
      observedAt === Date.parse(previous.observedAt) &&
      previous.inside !== inside &&
      inside
    )
      return;
    // 전송 실패한 이탈을 먼저 확정해야 재진입을 새 방문으로 구분할 수 있다.
    if (inside && previous && !previous.inside && !previous.synced)
      await send(key, transport, id, previous);
    const reportedAt = previous?.reportedAt ?? previous?.observedAt;
    const heartbeatDue =
      inside && (!reportedAt || observedAt - Date.parse(reportedAt) >= HEARTBEAT_INTERVAL_MS);
    if (previous?.inside === inside && previous.synced && !force && !heartbeatDue) {
      await alertStorage.setItem(
        key,
        JSON.stringify({
          inside,
          observedAt: new Date(observedAt).toISOString(),
          synced: true,
          reportedAt,
        }),
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

/** 백그라운드 위치 확인은 사용 중인 알림의 실제 진입 상태가 있을 때만 유지한다. */
export async function hasInsideProximityVisits(identifiers: string[]) {
  const visits = await Promise.all(
    identifiers.map(async (id) => {
      const raw = await alertStorage.getItem(`${PREFIX}${id}`);
      return raw ? (JSON.parse(raw) as Visit) : null;
    }),
  );
  return visits.some(
    (visit, index) =>
      useAppStore.getState().proximityVisits[identifiers[index]]?.inside ?? visit?.inside,
  );
}

export function retryProximityReports() {
  return serialize(async () => {
    const attempts: Promise<unknown>[] = [];
    for (const key of await alertStorage.getAllKeys()) {
      if (!key.startsWith(PREFIX)) continue;
      const visit = JSON.parse((await alertStorage.getItem(key)) ?? 'null') as Visit | null;
      if (!visit || visit.synced || visit.inside) continue;
      const [transport, id] = key.slice(PREFIX.length).split(':');
      if (transport !== 'bus' && transport !== 'subway') continue;
      attempts.push(send(key, transport, id, visit));
    }
    const results = await Promise.allSettled(attempts);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  });
}
