import { StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { appColors as c } from '@/shared/ui/theme';
import { useWidgetArrival } from '../model/use-widget-arrival';
import type { WidgetTarget } from '../model/widget-configuration';

/** 실제 홈 위젯과 같은 순서: 작은 크기 1–3, 큰 크기 왼쪽 1–3·오른쪽 4–6. */
export function WidgetPreviews({ items }: { items: WidgetTarget[] }) {
  return (
    <View style={s.section}>
      <Text style={s.heading}>미리보기</Text>
      <Text style={s.label}>작은 위젯 · 최대 3개</Text>
      <Preview items={items} small />
      <Text style={s.label}>큰 위젯 · 최대 6개</Text>
      <Preview items={items} />
    </View>
  );
}
function Preview({ items, small = false }: { items: WidgetTarget[]; small?: boolean }) {
  return (
    <View style={[s.widget, small ? s.small : s.large]}>
      <View style={s.header}>
        <Text style={s.brand}>TaraGo</Text>
        <SymbolView
          name={{ ios: 'arrow.clockwise', android: 'refresh' }}
          size={11}
          tintColor={c.accent}
        />
      </View>
      <View style={s.body}>
        {!items.length ? (
          <View style={s.emptyBody}>
            <Text style={s.plus}>+</Text>
          </View>
        ) : (
          [0, 1, 2].map((index) => (
            <View key={index} style={[s.row, index < 2 && s.divider]}>
              <Cell item={items[index]} />
              {!small && (
                <>
                  <View style={s.vertical} />
                  <Cell item={items[index + 3]} />
                </>
              )}
            </View>
          ))
        )}
      </View>
    </View>
  );
}
function Cell({ item }: { item?: WidgetTarget }) {
  return item ? <Arrival item={item} /> : <Text style={s.empty}>—</Text>;
}
function Arrival({ item }: { item: WidgetTarget }) {
  const { direction, time } = useWidgetArrival(item, false);
  return (
    <View style={s.cell} accessibilityLabel={`${item.title} ${direction} ${time}`}>
      <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
        {item.title}
      </Text>
      <Text style={s.direction} numberOfLines={1}>
        {direction.replace(/ 방면$/, '')}
      </Text>
      <Text style={s.time} numberOfLines={1}>
        {time === '조회 중' ? '—' : time}
      </Text>
    </View>
  );
}
const s = StyleSheet.create({
  section: { paddingTop: 28, gap: 12 },
  heading: { fontSize: 17, fontWeight: '600', color: c.text, marginBottom: 4 },
  label: { fontSize: 12, color: c.secondaryText },
  widget: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.separator,
    padding: 12,
  },
  small: { width: 170, height: 170, marginBottom: 8 },
  large: { width: '100%', aspectRatio: 1, maxWidth: 360 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  brand: { fontSize: 10, fontWeight: '500', color: c.accent },
  body: { flex: 1 },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
  vertical: { width: StyleSheet.hairlineWidth, height: 22, backgroundColor: c.separator },
  cell: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { width: 35, fontSize: 10, fontWeight: '500', color: c.text },
  direction: { flex: 1, fontSize: 9, color: c.secondaryText },
  time: {
    fontSize: 11,
    fontWeight: '500',
    color: c.accent,
    width: 38,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  emptyBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  plus: { fontSize: 24, fontWeight: '300', color: c.accent },
  empty: { flex: 1, fontSize: 11, color: c.tertiaryText },
});
