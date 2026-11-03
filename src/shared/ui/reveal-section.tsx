import type { ReactNode } from 'react';
import Animated, { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated';

/** 입력값 변경에는 재실행하지 않고, 진입 시에만 짧은 간격으로 설정 항목을 드러낸다. */
export function RevealSection({ order, children }: { order: number; children: ReactNode }) {
  return (
    <Animated.View
      style={{ gap: 16 }}
      entering={FadeInDown.withInitialValues({ transform: [{ translateY: 12 }] })
        .delay(Math.min(order, 7) * 60)
        .duration(280)
        .easing(Easing.out(Easing.cubic))
        .reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
  );
}
