import { create } from 'zustand';

type Recovery = { source: string; message: string; retry?: () => Promise<unknown>; action?: string };

/** 오류 원본이 해소할 때까지 안내를 유지한다. 다른 오류를 해결해도 남은 오류는 보존한다. */
export const useRecoveryStore = create<{
  notice: Recovery | null;
  notices: Record<string, Recovery>;
  show: (notice: Recovery) => void;
  clear: (source: string) => void;
}>((set) => ({
  notice: null,
  notices: {},
  show: (notice) => set((state) => {
    const notices = { ...state.notices, [notice.source]: notice };
    return { notices, notice: Object.values(notices)[0] ?? null };
  }),
  clear: (source) => set((state) => {
    if (!state.notices[source]) return state;
    const notices = { ...state.notices };
    delete notices[source];
    return { notices, notice: Object.values(notices)[0] ?? null };
  }),
}));
