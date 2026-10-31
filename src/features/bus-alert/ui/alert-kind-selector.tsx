import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { AlertKind } from '../model/alert-form';
import { alertColors as c } from './alert-design';

/** 고정된 두 영역 아래에서 강조면만 이동해 선택 중에도 글자의 위치를 유지한다. */
export function AlertKindSelector({
  value,
  disabled,
  onChange,
}: {
  value: AlertKind;
  disabled: boolean;
  onChange: (value: AlertKind) => void;
}) {
  const [width, setWidth] = useState(0);
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(value === 'location' ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(value === 'location' ? 1 : 0, {
      duration: reducedMotion ? 0 : 220,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [value, progress, reducedMotion]);
  const itemWidth = Math.max(0, (width - 10) / 2);
  const highlight = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * itemWidth }],
  }));
  return (
    <View style={s.track} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[s.highlight, { width: itemWidth }, highlight]}
        />
      ) : null}
      {(['time', 'location'] as const).map((kind) => (
        <Pressable
          key={kind}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === kind, disabled }}
          disabled={disabled}
          onPress={() => onChange(kind)}
          style={({ pressed }) => [s.item, { opacity: disabled ? 0.5 : pressed ? 0.75 : 1 }]}
        >
          <SymbolView
            name={
              kind === 'time'
                ? { ios: 'clock', android: 'schedule' }
                : { ios: 'location', android: 'near_me' }
            }
            size={18}
            tintColor={value === kind ? c.onAccent : c.secondaryText}
          />
          <Text style={[s.label, value === kind && s.selected]}>
            {kind === 'time' ? '예약 알림' : '위치 알림'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  track: {
    minHeight: 56,
    padding: 4,
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  highlight: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 12,
    backgroundColor: c.accent,
    borderWidth: 1,
    borderColor: c.accent,
  },
  item: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 15, fontWeight: '600', color: c.secondaryText },
  selected: { color: c.onAccent },
});
