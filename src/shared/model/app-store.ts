/** @fileoverview 앱 전역 UI 상태인 탭 숨김 여부와 알림 런타임 오류를 관리하는 Zustand 스토어. */
import { create } from 'zustand';

export type AlertMenu = { transport: 'bus' | 'subway'; kind: 'time' | 'location' };
export type AlertSelection = AlertMenu & { requestId: string };

/** 화면 간 공유하는 UI 상태와 각 상태의 변경 동작. 서버 응답은 TanStack Query가 관리한다. */
type AppState = {
  proximityVisits: Record<string, { inside: boolean; observedAt: number }>;
  setProximityVisit: (key: string, inside: boolean, observedAt: number) => void;
  alertMenu: AlertMenu;
  setAlertMenu: (menu: AlertMenu) => void;
  alertSelection: AlertSelection | null;
  startAlertSelection: (selection: AlertSelection) => void;
  finishAlertSelection: () => void;

  /** 지도 검색·상세 시트가 열렸을 때 하단 탭을 숨기는 상태. */
  isMapTabHidden: boolean;
  setMapTabHidden: (hidden: boolean) => void;

  /** 위치 접근 감지·알림 응답 처리 중 발생한 최근 오류. null은 오류 없음. */
  alertRuntimeError: string | null;
  setAlertRuntimeError: (error: string | null) => void;
};

/** 모듈 단위로 생성되는 앱 UI 스토어. 각 화면은 selector로 필요한 값이나 액션만 구독한다. */
export const useAppStore = create<AppState>()((set) => ({
  proximityVisits: {},
  setProximityVisit: (key, inside, observedAt) => set((state) => {
    const previous = state.proximityVisits[key];
    if (previous && observedAt <= previous.observedAt) return state;
    return { proximityVisits: { ...state.proximityVisits, [key]: { inside, observedAt } } };
  }),
  alertMenu: { transport: 'bus', kind: 'time' },
  setAlertMenu: (alertMenu) => set({ alertMenu }),
  alertSelection: null,
  startAlertSelection: (alertSelection) =>
    set({
      alertSelection,
      alertMenu: { transport: alertSelection.transport, kind: alertSelection.kind },
      isMapTabHidden: true,
    }),
  finishAlertSelection: () => set({ alertSelection: null, isMapTabHidden: false }),
  isMapTabHidden: false,
  setMapTabHidden: (hidden) => set({ isMapTabHidden: hidden }),

  alertRuntimeError: null,
  setAlertRuntimeError: (error) => set({ alertRuntimeError: error }),
}));
