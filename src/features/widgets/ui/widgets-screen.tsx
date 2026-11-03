import { Pressable, ScrollView, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { SafeAreaView } from 'react-native-screens/experimental';
import { router } from 'expo-router';
import { AppHeader } from '@/shared/ui/app-header';
import { appColors as c } from '@/shared/ui/theme';
import { MAX_WIDGET_ITEMS, useWidgetSelection } from '../model/widget-selection';
import { WidgetPreviews } from './widget-previews';
import { WidgetTransitRow } from './widget-transit-row';

export function WidgetsScreen() {
  const { selected, busy, hydrated, remove, error, storageError } = useWidgetSelection();
  const full = selected.length >= MAX_WIDGET_ITEMS;
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.surface }}
      edges={{ top: true, left: true, right: true, bottom: true }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <AppHeader
          title="위젯 리스트"
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="위젯에 버스 또는 지하철 추가"
              accessibilityState={{ disabled: full || busy || !hydrated }}
              disabled={full || busy || !hydrated}
              onPress={() => router.push('/widget-add')}
              style={{
                width: 44,
                height: 44,
                justifyContent: 'center',
                alignItems: 'flex-end',
                opacity: full || busy ? 0.35 : 1,
              }}
            >
              <SymbolView name={{ ios: 'plus', android: 'add' }} size={24} tintColor={c.accent} />
            </Pressable>
          }
        />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            gap: 6,
            paddingTop: 8,
            paddingBottom: 12,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
            총 {selected.length}개
          </Text>
          <Text style={{ fontSize: 12, color: c.secondaryText }}>/ {MAX_WIDGET_ITEMS}개</Text>
        </View>
        {(error || storageError) && (
          <Text accessibilityRole="alert" style={{ color: c.danger, paddingVertical: 12 }}>
            {storageError ?? error}
          </Text>
        )}
        {selected.map((item) => (
          <WidgetTransitRow
            key={item.id}
            item={item}
            disabled={busy}
            onRemove={() => void remove(item.id)}
          />
        ))}
        {!selected.length && hydrated && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/widget-add')}
            style={{ paddingVertical: 16 }}
          >
            <Text style={{ fontSize: 14, color: c.secondaryText }}>버스·지하철 추가</Text>
          </Pressable>
        )}
        <WidgetPreviews items={selected} />
      </ScrollView>
    </SafeAreaView>
  );
}
