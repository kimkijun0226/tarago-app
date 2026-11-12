import { useEffect, type ReactNode } from 'react';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';

export function EditWiggle({ active, index, children, amplitude = 2 }: {
  active: boolean; index: number; children: ReactNode; amplitude?: number;
}) {
  const reduceMotion = useReducedMotion();
  const angle = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(angle);
    if (active && !reduceMotion) {
      angle.set(withDelay((index % 5) * 28,
        withRepeat(withSequence(
          withTiming(-amplitude, { duration: 130, easing: Easing.inOut(Easing.quad) }),
          withTiming(amplitude, { duration: 130, easing: Easing.inOut(Easing.quad) }),
        ), -1, false)));
    } else {
      angle.set(withTiming(0, { duration: 120, reduceMotion: ReduceMotion.System }));
    }
    return () => cancelAnimation(angle);
  }, [active, amplitude, angle, index, reduceMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.get()}deg` }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
