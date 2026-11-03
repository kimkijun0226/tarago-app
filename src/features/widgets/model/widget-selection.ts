import { requireOptionalNativeModule } from 'expo';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { API_STORAGE_SCOPE } from '@/shared/api/config';
import type { WidgetTarget } from './widget-configuration';

export const MAX_WIDGET_ITEMS = 6;
const STORAGE_KEY = `tarago-widget-targets-v2-${API_STORAGE_SCOPE}`;
export const widgetNative =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<{ writeConfiguration: (configuration: string) => void }>(
        'TaraGoWidgets',
      )
    : null;

export type WidgetMapSelection = { transport: 'bus' | 'subway'; requestId: string };

type WidgetState = {
  mapSelection: WidgetMapSelection | null;
  startMapSelection: (selection: WidgetMapSelection) => void;
  finishMapSelection: () => void;
  switchMapTransport: (transport: WidgetMapSelection['transport']) => void;
  selected: WidgetTarget[];
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  storageError: string | null;
  setError: (error: string | null) => void;
  initialize: () => Promise<void>;
  add: (item: WidgetTarget) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
};

export function isWidgetTarget(item: unknown): item is WidgetTarget {
  if (!item || typeof item !== 'object') return false;
  const value = item as Record<string, unknown>;
  if (
    ['id', 'title', 'stationName', 'directionLabel'].some((key) => typeof value[key] !== 'string')
  )
    return false;
  return value.transport === 'bus'
    ? typeof value.stationId === 'string' &&
        typeof value.routeId === 'string' &&
        (value.stationSeq === undefined ||
          (Number.isInteger(value.stationSeq) && Number(value.stationSeq) > 0))
    : value.transport === 'subway' &&
        typeof value.lineId === 'string' &&
        typeof value.direction === 'string' &&
        (value.destination === undefined || typeof value.destination === 'string') &&
        (value.destinations === undefined ||
          (Array.isArray(value.destinations) &&
            value.destinations.every((name) => typeof name === 'string')));
}

/** 선택한 조회 조건만 보관하고 도착정보는 Query가 관리한다. */
export const useWidgetSelection = create<WidgetState>()((set, get) => {
  const save = async (selected: WidgetTarget[]) => {
    if (get().busy || !get().hydrated) return false;
    set({ busy: true });
    try {
      await Storage.setItem(STORAGE_KEY, JSON.stringify(selected));
      set({ selected, storageError: null });
      return true;
    } catch (error) {
      console.warn('위젯 목록 저장 실패', error instanceof Error ? error.name : 'unknown');
      set({ storageError: '저장하지 못했어요. 다시 시도해주세요.' });
      return false;
    } finally {
      set({ busy: false });
    }
  };
  return {
    mapSelection: null,
    startMapSelection: (mapSelection) => set({ mapSelection }),
    finishMapSelection: () => set({ mapSelection: null }),
    switchMapTransport: (transport) =>
      set((state) =>
        state.mapSelection ? { mapSelection: { ...state.mapSelection, transport } } : state,
      ),
    selected: [],
    hydrated: false,
    busy: false,
    error: null,
    storageError: null,
    setError: (error) => set({ error }),
    initialize: async () => {
      if (get().hydrated || get().busy) return;
      set({ busy: true });
      try {
        const raw = await Storage.getItem(STORAGE_KEY);
        const saved: unknown = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(saved)) throw new Error('Invalid widget targets');
        const ids = new Set<string>();
        const selected = saved
          .filter(isWidgetTarget)
          .filter((item) => {
            if (ids.has(item.id)) return false;
            ids.add(item.id);
            return true;
          })
          .slice(0, MAX_WIDGET_ITEMS);
        set({ selected, hydrated: true, storageError: null });
      } catch (error) {
        console.warn('위젯 목록 읽기 실패', error instanceof Error ? error.name : 'unknown');
        set({ storageError: '목록을 불러오지 못했어요. 다시 열어주세요.' });
      } finally {
        set({ busy: false });
      }
    },
    add: async (item) => {
      if (!isWidgetTarget(item)) return false;
      if (get().selected.some((value) => value.id === item.id)) return true;
      if (get().selected.length >= MAX_WIDGET_ITEMS) return false;
      return save([...get().selected, item]);
    },
    remove: async (id) => {
      await save(get().selected.filter((item) => item.id !== id));
    },
  };
});
