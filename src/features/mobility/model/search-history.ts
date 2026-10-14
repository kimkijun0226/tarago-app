import Storage from 'expo-sqlite/kv-store';
import type { Place } from '../api/mobility';
const KEY = 'tarago-recent-places';

/** 최근 선택한 장소만 기기에 보관하고 손상된 캐시는 검색을 막지 않는다. */
export async function readPlaceHistory(): Promise<Place[]> {
  const raw = await Storage.getItem(KEY);
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data) ? data.filter((p): p is Place => p && typeof p.id === 'string' && typeof p.name === 'string'
      && typeof p.address === 'string' && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)).slice(0, 10) : [];
  } catch (error) { console.warn('최근 장소 캐시 해석 실패', error instanceof Error ? error.name : 'unknown'); return []; }
}
export async function savePlaceHistory(places: Place[]) { await Storage.setItem(KEY, JSON.stringify(places.slice(0, 10))); }
