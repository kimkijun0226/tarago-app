import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppHeader } from './app-header';
import { appColors as c } from './theme';

/** 탐색 헤더와 본문의 질문을 분리한다. */
export function SetupHeader({
  title,
  current,
  labels,
  headerTitle,
  onBack,
  disabled,
  right,
}: {
  title: string;
  current: 0 | 1 | 2;
  labels: readonly [string, string, string];
  headerTitle: string;
  onBack: () => void;
  disabled?: boolean;
  right?: ReactNode;
}) {
  return (
    <View style={s.container}>
      <AppHeader
        title={headerTitle}
        titleVisual={<Text style={s.navigationTitle}>{headerTitle}</Text>}
        onBack={onBack}
        disabled={disabled}
        right={right}
      />
      <View style={s.steps} accessibilityLabel={`${current + 1} / 3 단계, ${labels[current]}`}>
        {labels.map((label, index) => (
          <View key={label} style={s.step}>
            <View style={[s.number, index <= current && s.activeNumber]}>
              <Text style={[s.numberText, index <= current && s.activeNumberText]}>
                {index + 1}
              </Text>
            </View>
            <Text style={[s.stepText, index === current && s.activeStepText]}>{label}</Text>
            {index < 2 && <View style={s.connector} />}
          </View>
        ))}
      </View>
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={s.title}
      >
        {title}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  container: { gap: 4, paddingBottom: 0 },
  navigationTitle: { fontSize: 16, lineHeight: 24, fontWeight: '500', color: c.bodyText },
  steps: { flexDirection: 'row', alignItems: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  number: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeNumber: { backgroundColor: c.accent },
  numberText: { fontSize: 11, fontWeight: '600', color: c.secondaryText },
  activeNumberText: { color: c.onAccent },
  stepText: { fontSize: 12, color: c.secondaryText },
  activeStepText: { color: c.accent },
  connector: { width: 10, height: 1, backgroundColor: c.borderStrong, marginHorizontal: 4 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '600', letterSpacing: -0.5, color: c.text },
});
