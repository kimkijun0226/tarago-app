import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { Easing, ReduceMotion, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** 손잡이와 상태 색을 함께 전환하며 서버 저장 중에도 크기를 유지한다. */
export function AlertToggle({ value, onChange, disabled, label, color, compact = false, onLongPress }: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
  color: string;
  compact?: boolean;
  onLongPress?: () => void;
}) {
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    if (!disabled) progress.set(withTiming(value ? 1 : 0, { duration: 180, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }));
  }, [value, disabled, progress]);
  const track = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.get(), [0, 1], ['#E8EDF3', color]) }));
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: progress.get() * (compact ? 26 : 31) }] }));
  const on = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const off = useAnimatedStyle(() => ({ opacity: 1 - progress.get() }));
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onLongPress={onLongPress}
      delayLongPress={300}
      onPress={() => {
        progress.set(withTiming(value ? 0 : 1, { duration: 180, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }));
        onChange(!value);
      }}
      hitSlop={8}
    >
      <Animated.View style={[s.track, compact && { width: 50, height: 24 }, track]}>
        <Animated.View style={[s.label, { left: 6 }, on]}>
          <Text style={[s.state, { color: '#FFFFFF', fontSize: compact ? 9 : 10 }]}>ON</Text>
        </Animated.View>
        <Animated.View style={[s.label, { left: compact ? 23 : 26 }, off]}>
          <Text style={[s.state, { color: '#586678', fontSize: compact ? 9 : 10 }]}>OFF</Text>
        </Animated.View>
        <Animated.View style={[s.thumb, compact && { width: 18, height: 18 }, thumb]} />
      </Animated.View>
    </Pressable>
  );
}
const s = StyleSheet.create({
  track: { width: 60, height: 30, borderRadius: 15, justifyContent: 'center' },
  label: { position: 'absolute' },
  state: { fontWeight: '700' },
  thumb: { position: 'absolute', left: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' },
});
