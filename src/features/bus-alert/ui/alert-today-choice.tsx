import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { Easing, ReduceMotion, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

export function AlertTodayChoice({ value, disabled, onChange }: {
  value: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    if (!disabled) progress.set(withTiming(value ? 1 : 0, { duration: 180, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }));
  }, [value, disabled, progress]);
  const background = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(progress.get(), [0, 1], ['#F0F3F7', '#E5F2FF']) }));
  const on = useAnimatedStyle(() => ({ opacity: progress.get(), transform: [{ translateY: (1 - progress.get()) * 5 }] }));
  const off = useAnimatedStyle(() => ({ opacity: 1 - progress.get(), transform: [{ translateY: -progress.get() * 5 }] }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`오늘 알림 ${value ? '켜짐, 눌러서 끄기' : '꺼짐, 눌러서 켜기'}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        progress.set(withTiming(value ? 0 : 1, { duration: 180, easing: Easing.inOut(Easing.quad), reduceMotion: ReduceMotion.System }));
        onChange(!value);
      }}
    >
      <Animated.View style={[s.button, background]}>
        <Text style={s.label}>오늘 알림</Text>
        <Animated.Text style={[s.state, s.on, on]}>ON</Animated.Text>
        <Animated.Text style={[s.state, s.off, off]}>OFF</Animated.Text>
      </Animated.View>
    </Pressable>
  );
}
const s = StyleSheet.create({
  button: { height: 28, width: 102, borderRadius: 8, paddingHorizontal: 10, justifyContent: 'center', overflow: 'hidden' },
  label: { fontSize: 11, color: '#61738B', fontWeight: '500' },
  state: { position: 'absolute', right: 10, fontSize: 11, fontWeight: '700' },
  on: { color: '#1685E8' },
  off: { color: '#61738B' },
});
