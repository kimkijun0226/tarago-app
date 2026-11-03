import { useAppStore, type AlertSelection } from '@/shared/model/app-store';
import { useWidgetSelection } from '@/features/widgets/model/widget-selection';

export type MapSelectionMode = 'map' | 'widget';
type Selection = Pick<AlertSelection, 'requestId' | 'transport'> &
  Partial<Pick<AlertSelection, 'kind' | 'resume'>>;

/** 같은 지도 UI를 쓰되 각 경로는 자신의 선택 상태만 읽는다. */
export function useMapSelection(mode: MapSelectionMode): Selection | null {
  const alert = useAppStore((state) => state.alertSelection);
  const widget = useWidgetSelection((state) => state.mapSelection);
  return mode === 'widget' ? widget : alert;
}
export function getMapSelection(mode: MapSelectionMode): Selection | null {
  return mode === 'widget'
    ? useWidgetSelection.getState().mapSelection
    : useAppStore.getState().alertSelection;
}
