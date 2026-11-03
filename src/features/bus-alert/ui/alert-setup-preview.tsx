import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeInDown, ReduceMotion } from 'react-native-reanimated';
import { alertColors as c } from './alert-design';

/** 위젯의 교통수단 카드와 같은 아이콘·설명 구조다. */
export function AlertSetupPreview({
  transport,
  kind,
  preparing = false,
}: {
  transport: 'bus' | 'subway';
  kind: 'time' | 'location';
  preparing?: boolean;
}) {
  const scheduled = kind === 'time';
  return (
    <Animated.View
      style={s.content}
      entering={FadeInDown.withInitialValues({ transform: [{ translateY: 8 }] })
        .delay(scheduled ? 0 : 60)
        .duration(220)
        .easing(Easing.out(Easing.cubic))
        .reduceMotion(ReduceMotion.System)}
    >
      <SymbolView
        name={scheduled ? { ios: 'clock', android: 'schedule' } : { ios: 'location', android: 'near_me' }}
        size={42}
        tintColor={c.accent}
      />
      <View style={s.labels}>
        <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {scheduled ? '예약 알림' : '위치 알림'}
        </Text>
        <Text style={s.description}>
          {scheduled ? '정한 요일과 시간에 도착을 알려드려요.' : `${transport === 'bus' ? '정류소' : '역'} 근처에 오면 도착을 알려드려요.`}
        </Text>
      </View>
      {preparing && <ActivityIndicator style={s.progress} color={c.accent} size="small" />}
    </Animated.View>
  );
}
const s = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 16 },
  labels: { alignItems: 'center', gap: 8, width: '100%' },
  title: { color: c.text, fontSize: 25, lineHeight: 33, fontWeight: '600', letterSpacing: -0.5, textAlign: 'center' },
  description: { color: c.secondaryText, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  progress: { position: 'absolute', right: 0, top: '50%', marginTop: -9, width: 20, alignItems: 'center' },
});
