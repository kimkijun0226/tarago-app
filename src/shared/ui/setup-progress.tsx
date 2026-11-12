import Animated from 'react-native-reanimated';
import { fadeIn } from './motion';
import { StyleSheet, View } from 'react-native';
import { appColors as c } from '@/shared/ui/theme';

/** 단계는 상단 진행 막대와 큰 제목으로 표현한다. 지도에서는 기존 선택 제목과 조립한다. */
export function SetupProgress({
  current,
  title,
  showTitle = true,
  compact = false,
  labels = ['교통수단 선택', '지도에서 선택', '즐겨찾기에 추가'],
}: {
  current: 0 | 1 | 2;
  title?: string;
  showTitle?: boolean;
  compact?: boolean;
  labels?: readonly [string, string, string];
}) {
  return (
    <View style={[s.container, compact && s.compact]}>
      <View
        style={s.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: 3, now: current + 1 }}
      >
        {labels.map((label, index) => (
          <View key={label} style={[s.segment, index <= current && s.complete]} />
        ))}
      </View>
      <Animated.Text entering={fadeIn} style={s.step}>
        {compact ? `${current + 1}. ${labels[current]}` : `${current + 1} / 3 단계`}
      </Animated.Text>
      {showTitle && (
        <Animated.Text entering={fadeIn.delay(60)} accessibilityRole="header" style={s.title}>
          {title ?? labels[current]}
        </Animated.Text>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 12 },
  compact: { flex: 1, gap: 6, justifyContent: 'center', flexDirection: 'column-reverse' },
  track: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.separator },
  complete: { backgroundColor: c.accent },
  step: { fontSize: 13, fontWeight: '500', color: c.accent },
  title: { fontSize: 27, lineHeight: 36, letterSpacing: -0.5, fontWeight: '600', color: c.text },
});
