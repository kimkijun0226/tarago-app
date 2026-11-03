import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { SetupHeader } from '@/shared/ui/setup-header';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { appColors as c } from '@/shared/ui/theme';
import { MAX_WIDGET_ITEMS, useWidgetSelection } from '../model/widget-selection';

/** 알림과 같은 지도 선택을 사용하지만 예약 없이 위젯 조회 대상만 저장한다. */
export function WidgetAddScreen() {
  const { selected, busy, hydrated } = useWidgetSelection();
  const disabled = busy || !hydrated || selected.length >= MAX_WIDGET_ITEMS;
  const begin = useCallback(
    (transport: 'bus' | 'subway') => {
      if (disabled) return;
      useWidgetSelection.getState().startMapSelection({
        transport,
        requestId: `widget:${Date.now()}`,
      });
      router.push('/widget-map');
    },
    [disabled],
  );
  return (
    <SafeAreaView style={s.page}>
      <View style={s.intro}>
        <SetupHeader
          current={0}
          labels={['교통수단', '지도 선택', '방면 선택']}
          headerTitle={'위젯 추가'}
          title="어떤 교통수단을 추가할까요?"
          onBack={() => router.dismissTo('/widgets')}
        />
      </View>
      <View style={s.choices}>
        {(['bus', 'subway'] as const).map((transport) => (
          <Pressable
            key={transport}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => begin(transport)}
            style={({ pressed }) => [s.choice, { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }]}
          >
            <TransportIcon transport={transport} size={52} tintColor={c.accent} />
            <View style={s.labels}>
              <Text style={s.title}>{transport === 'bus' ? '버스' : '지하철'}</Text>
              <Text style={s.detail}>
                {transport === 'bus' ? '정류소와 버스 선택' : '역과 호선·방면 선택'}
              </Text>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right' }}
              size={22}
              tintColor={c.accent}
            />
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 4 },
  intro: { paddingBottom: 16 },
  choices: { flex: 1, gap: 12, paddingBottom: 16 },
  choice: {
    flex: 1,
    minHeight: 120,
    shadowColor: '#203550',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.accentBorder,
    backgroundColor: c.secondarySurface,
  },
  labels: { flex: 1, gap: 4 },
  title: { fontSize: 26, fontWeight: '600', color: c.text },
  detail: { fontSize: 14, color: c.secondaryText },
});
