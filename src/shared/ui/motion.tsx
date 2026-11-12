import { useEffect, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeOut, ReduceMotion, useAnimatedStyle, useSharedValue,
  withRepeat, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export const motionIn = { duration: 260, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };
export const motionOut = { duration: 220, easing: Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System };
export const fadeIn = FadeIn.duration(motionIn.duration).easing(motionIn.easing).reduceMotion(ReduceMotion.System);
export const fadeOut = FadeOut.duration(motionOut.duration).easing(motionOut.easing).reduceMotion(ReduceMotion.System);

/** Keep the native modal mounted while its dimmer and panel finish their exit. */
export function MotionModal({ visible, onRequestClose, children, kind = 'popup' }: {
  visible: boolean;
  onRequestClose: () => void;
  children: ReactNode;
  kind?: 'popup' | 'sheet';
}) {
  const [mounted, setMounted] = useState(false);
  if (visible && !mounted) setMounted(true);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      progress.set(withTiming(1, motionIn));
    } else {
      progress.set(withTiming(0, motionOut, (finished) => {
        if (finished) scheduleOnRN(setMounted, false);
      }));
    }
  }, [progress, visible]);

  const dimmer = useAnimatedStyle(() => ({ opacity: progress.get() * 0.24 }));
  const panel = useAnimatedStyle(() => ({
    transform: kind === 'sheet'
      ? [{ translateY: (1 - progress.get()) * 480 }]
      : [{ scale: 0.9 + progress.get() * 0.1 }],
    opacity: progress.get(),
  }));
  if (!visible && !mounted) return null;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onRequestClose}>
      <View style={styles.modal}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dimmer, dimmer]} />
        <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.panel, panel]}>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Draw the short and long strokes in order while keeping the row width fixed. */
export function MotionCheck({ checked, color }: { checked: boolean; color: string }) {
  const progress = useSharedValue(checked ? 1 : 0);
  useEffect(() => {
    progress.set(withTiming(checked ? 1 : 0, {
      duration: 240, easing: Easing.inOut(Easing.cubic), reduceMotion: ReduceMotion.System,
    }));
  }, [checked, progress]);
  const short = useAnimatedStyle(() => ({ width: Math.min(progress.get() / 0.38, 1) * 6 }));
  const long = useAnimatedStyle(() => ({ width: Math.max(0, (progress.get() - 0.38) / 0.62) * 11 }));
  return (
    <View style={styles.check} accessibilityElementsHidden importantForAccessibility="no">
      <Animated.View style={[styles.stroke, { backgroundColor: color, left: 2, top: 8, transform: [{ rotate: '45deg' }] }, short]} />
      <Animated.View style={[styles.stroke, { backgroundColor: color, left: 6, top: 12, transform: [{ rotate: '-45deg' }] }, long]} />
    </View>
  );
}

export function MotionSpinner({ color }: { color: string }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1, false, undefined, ReduceMotion.System));
  }, [turn]);
  const rotation = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get() * 360}deg` }] }));
  return <Animated.View accessibilityRole="progressbar" style={[styles.spinner, { borderTopColor: color }, rotation]} />;
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  panel: { flex: 1 },
  dimmer: { backgroundColor: '#000' },
  check: { width: 18, height: 18 },
  stroke: { position: 'absolute', height: 2, borderRadius: 1, transformOrigin: 'left center' },
  spinner: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: 'transparent' },
});
