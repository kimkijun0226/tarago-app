import { useBottomSheetInternal, useGestureEventsHandlersDefault } from '@gorhom/bottom-sheet';
import { useSharedValue } from 'react-native-reanimated';

/** 한 번의 드래그는 시작 위치의 인접 스냅 포인트까지만 허용한다. 버튼의 높이 변경은 제한하지 않는다. */
export function useSingleStepSheetGesture(): ReturnType<typeof useGestureEventsHandlersDefault> {
  const handlers = useGestureEventsHandlersDefault();
  const { animatedPosition, animatedDetentsState } = useBottomSheetInternal();
  const start = useSharedValue(0);
  const lower = useSharedValue(0);
  const upper = useSharedValue(0);

  return {
    ...handlers,
    handleOnStart(source, event) {
      'worklet';
      handlers.handleOnStart(source, event);
      start.value = animatedPosition.value;
      const detents = animatedDetentsState.get().detents;
      lower.value = start.value;
      upper.value = start.value;
      if (!detents?.length) return;
      let nearest = 0;
      for (let i = 1; i < detents.length; i++) {
        if (Math.abs(detents[i] - start.value) < Math.abs(detents[nearest] - start.value)) {
          nearest = i;
        }
      }
      lower.value = detents[Math.min(nearest + 1, detents.length - 1)];
      upper.value = detents[Math.max(nearest - 1, 0)];
    },
    handleOnChange(source, event) {
      'worklet';
      const position = Math.max(
        lower.value,
        Math.min(upper.value, start.value + event.translationY),
      );
      handlers.handleOnChange(source, { ...event, translationY: position - start.value });
    },
    handleOnEnd(source, event) {
      'worklet';
      // 기본 핸들러의 속도 예측을 인접 범위로 제한한 뒤 추가 관성 없이 정착시킨다.
      const projected = start.value + event.translationY + 0.2 * event.velocityY;
      const position = Math.max(lower.value, Math.min(upper.value, projected));
      handlers.handleOnEnd(source, {
        ...event,
        translationY: position - start.value,
        velocityY: 0,
      });
    },
  };
}
