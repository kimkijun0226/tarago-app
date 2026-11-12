import { useCallback, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { appColors } from './theme';

/** Follow the finger on iOS when the current screen owns its back state. */
export function EdgeBack({ children, onBack, enabled = true, revealBehind = false }: {
  children: ReactNode;
  onBack: () => void;
  enabled?: boolean;
  revealBehind?: boolean;
}) {
  const { width } = useWindowDimensions();
  const offset = useSharedValue(0);
  const committing = useSharedValue(false);
  const finishBack = useCallback(() => {
    onBack();
    requestAnimationFrame(() => {
      offset.set(0);
      committing.set(false);
    });
  }, [committing, offset, onBack]);
  const gesture = useMemo(() => Gesture.Pan()
    .enabled(enabled)
    .hitSlop({ left: 0, width: 24 })
    .maxPointers(1)
    .activeOffsetX(14)
    .failOffsetX(-10)
    .failOffsetY([-14, 14])
    .onStart(() => {
      if (!committing.get()) cancelAnimation(offset);
    })
    .onUpdate(({ translationX }) => {
      if (!committing.get()) offset.set(Math.max(0, Math.min(width, translationX)));
    })
    .onEnd(({ translationX, translationY, velocityX }, success) => {
      if (committing.get() || !success || translationX <= Math.abs(translationY) * 1.4) return;
      if (translationX < Math.min(100, width * 0.28) && !(translationX >= 30 && velocityX > 500)) return;
      committing.set(true);
      offset.set(withTiming(width, {
        duration: 180, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System,
      }, (finished) => {
        if (finished) scheduleOnRN(finishBack);
      }));
    })
    .onFinalize(() => {
      if (!committing.get()) {
        offset.set(withSpring(0, {
          damping: 26, stiffness: 300, overshootClamping: true, reduceMotion: ReduceMotion.System,
        }));
      }
    }), [committing, enabled, finishBack, offset, width]);
  const position = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.get() }],
  }));

  if (Platform.OS !== 'ios') return children;
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View collapsable={false} style={[styles.background, revealBehind && styles.transparent]}>
        <Animated.View style={[styles.content, position]}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: appColors.background, overflow: 'hidden' },
  transparent: { backgroundColor: 'transparent' },
  content: { flex: 1 },
});
