import Storage from 'expo-sqlite/kv-store';
import { create } from 'zustand';
import { API_STORAGE_SCOPE } from '@/shared/api/config';
import type { WidgetTarget } from './widget-configuration';

const STORAGE_KEY = `tarago-favorite-groups-v1-${API_STORAGE_SCOPE}`;
const LEGACY_KEY = `tarago-widget-targets-v2-${API_STORAGE_SCOPE}`;
export type FavoriteGroup = { id: string; title: string; items: WidgetTarget[]; columns?: 2 | 4 };
export type WidgetMapSelection = { transport: 'bus' | 'subway'; requestId: string };

type WidgetState = {
  groups: FavoriteGroup[];
  activeGroupId: string | null;
  selected: WidgetTarget[];
  activateGroup: (id: string) => boolean;
  createGroup: (title: string) => Promise<string | null>;
  renameGroup: (id: string, title: string) => Promise<boolean>;
  setColumns: (id: string, columns: 2 | 4) => Promise<boolean>;
  removeGroup: (id: string) => Promise<void>;
  mapSelection: WidgetMapSelection | null;
  startMapSelection: (selection: WidgetMapSelection) => void;
  finishMapSelection: () => void;
  switchMapTransport: (transport: WidgetMapSelection['transport']) => void;
  hydrated: boolean;
  busy: boolean;
  error: string | null;
  storageError: string | null;
  setError: (error: string | null) => void;
  initialize: () => Promise<void>;
  add: (item: WidgetTarget) => Promise<boolean>;
  remove: (id: string, groupId?: string) => Promise<void>;
  reorder: (ids: string[], groupId?: string) => Promise<boolean>;
};

export function isWidgetTarget(item: unknown): item is WidgetTarget {
  if (!item || typeof item !== 'object') return false;
  const value = item as Record<string, unknown>;
  if (
    value.color !== undefined &&
    (typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color))
  )
    return false;
  if (
    ['id', 'title', 'stationName', 'directionLabel'].some((key) => typeof value[key] !== 'string')
  )
    return false;
  return value.transport === 'bus'
    ? ((value.latitude === undefined && value.longitude === undefined) ||
        (typeof value.latitude === 'number' &&
          Number.isFinite(value.latitude) &&
          Math.abs(value.latitude) <= 90 &&
          typeof value.longitude === 'number' &&
          Number.isFinite(value.longitude) &&
          Math.abs(value.longitude) <= 180)) &&
        typeof value.stationId === 'string' &&
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

function uniqueItems(items: unknown[]): WidgetTarget[] {
  const ids = new Set<string>();
  return items.filter(isWidgetTarget).filter((item) => {
    if (ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
}

/** 그룹과 선택 조건만 저장하며 도착정보는 화면의 Query가 관리한다. 기존 위젯 목록은 첫 그룹으로 옮긴다. */
export const useWidgetSelection = create<WidgetState>()((set, get) => {
  const save = async (groups: FavoriteGroup[], activeId = get().activeGroupId) => {
    if (get().busy || !get().hydrated) return false;
    const active = groups.find((group) => group.id === activeId) ?? groups[0];
    set({ busy: true });
    try {
      await Storage.setItem(
        STORAGE_KEY,
        JSON.stringify({ groups, activeGroupId: active?.id ?? null }),
      );
      set({
        groups,
        activeGroupId: active?.id ?? null,
        selected: active?.items ?? [],
        storageError: null,
      });
      return true;
    } catch (error) {
      console.warn('즐겨찾기 저장 실패', error instanceof Error ? error.name : 'unknown');
      set({ storageError: '저장하지 못했어요. 다시 시도해주세요.' });
      return false;
    } finally {
      set({ busy: false });
    }
  };
  return {
    groups: [],
    activeGroupId: null,
    selected: [],
    activateGroup: (id) => {
      if (get().busy) return false;
      const group = get().groups.find((group) => group.id === id);
      if (!group) return false;
      set({ activeGroupId: id, selected: group.items });
      return true;
    },
    createGroup: async (title) => {
      const name = title.trim().slice(0, 40);
      if (!name) return null;
      const id = `group:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
      return (await save([...get().groups, { id, title: name, items: [] }], id)) ? id : null;
    },
    renameGroup: async (id, title) => {
      const name = title.trim().slice(0, 40);
      if (!name || !get().groups.some((group) => group.id === id)) return false;
      return save(
        get().groups.map((group) => (group.id === id ? { ...group, title: name } : group)),
      );
    },
    setColumns: async (id, columns) => {
      if (columns !== 2 && columns !== 4) return false;
      return save(get().groups.map((group) => (group.id === id ? { ...group, columns } : group)));
    },
    removeGroup: async (id) => {
      await save(get().groups.filter((group) => group.id !== id));
    },
    mapSelection: null,
    startMapSelection: (mapSelection) => set({ mapSelection }),
    finishMapSelection: () => set({ mapSelection: null }),
    switchMapTransport: (transport) =>
      set((state) => ({
        mapSelection: state.mapSelection ? { ...state.mapSelection, transport } : null,
      })),
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
        let groups: FavoriteGroup[];
        let activeId: string | null = null;
        if (raw) {
          const saved: unknown = JSON.parse(raw);
          if (
            !saved ||
            typeof saved !== 'object' ||
            !('groups' in saved) ||
            !Array.isArray(saved.groups)
          )
            throw new Error('Invalid favorites');
          const ids = new Set<string>();
          groups = saved.groups.map((group: unknown) => {
            if (
              !group ||
              typeof group !== 'object' ||
              !('id' in group) ||
              typeof group.id !== 'string' ||
              !group.id ||
              ids.has(group.id) ||
              !('title' in group) ||
              typeof group.title !== 'string' ||
              !group.title.trim() ||
              !('items' in group) ||
              !Array.isArray(group.items)
            )
              throw new Error('Invalid favorite group');
            ids.add(group.id);
            return {
              id: group.id,
              title: group.title.trim().slice(0, 40),
              items: uniqueItems(group.items),
              columns: 'columns' in group && group.columns === 2 ? 2 : 4,
            };
          });
          if ('activeGroupId' in saved && typeof saved.activeGroupId === 'string')
            activeId = saved.activeGroupId;
        } else {
          const legacy = await Storage.getItem(LEGACY_KEY);
          const saved: unknown = legacy ? JSON.parse(legacy) : [];
          if (!Array.isArray(saved)) throw new Error('Invalid saved routes');
          groups = [{ id: 'favorites-default', title: '집 근처', items: uniqueItems(saved) }];
          await Storage.setItem(
            STORAGE_KEY,
            JSON.stringify({ groups, activeGroupId: groups[0].id }),
          );
        }
        const active = groups.find((group) => group.id === activeId) ?? groups[0];
        set({
          groups,
          activeGroupId: active?.id ?? null,
          selected: active?.items ?? [],
          hydrated: true,
          storageError: null,
        });
      } catch (error) {
        console.warn('즐겨찾기 읽기 실패', error instanceof Error ? error.name : 'unknown');
        set({ storageError: '즐겨찾기를 불러오지 못했어요. 다시 시도해주세요.' });
      } finally {
        set({ busy: false });
      }
    },
    add: async (item) => {
      if (!isWidgetTarget(item)) return false;
      const group = get().groups.find((group) => group.id === get().activeGroupId);
      if (!group) return false;
      if (group.items.some((value) => value.id === item.id)) return true;
      return save(
        get().groups.map((value) =>
          value.id === group.id ? { ...value, items: [...value.items, item] } : value,
        ),
      );
    },
    reorder: async (ids, groupId = get().activeGroupId ?? '') => {
      const group = get().groups.find((group) => group.id === groupId);
      if (!group || ids.length !== group.items.length || new Set(ids).size !== ids.length)
        return false;
      const byId = new Map(group.items.map((item) => [item.id, item]));
      if (ids.some((id) => !byId.has(id))) return false;
      return save(
        get().groups.map((value) =>
          value.id === groupId ? { ...value, items: ids.map((id) => byId.get(id)!) } : value,
        ),
      );
    },
    remove: async (id, groupId = get().activeGroupId ?? '') => {
      await save(
        get().groups.map((group) =>
          group.id === groupId
            ? { ...group, items: group.items.filter((item) => item.id !== id) }
            : group,
        ),
      );
    },
  };
});
