import { useWidgetArrival } from '../model/use-widget-arrival';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { appColors as c } from '@/shared/ui/theme';
import type { WidgetTarget } from '../model/widget-configuration';

export function WidgetTransitRow({
  item,
  onRemove,
  disabled,
}: {
  item: WidgetTarget;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { direction, time } = useWidgetArrival(item);
  return (
    <View style={s.row}>
      <TransportIcon transport={item.transport} size={17} tintColor={c.accent} />
      <View style={s.names}>
        <View style={s.line}>
          <Text style={s.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={s.direction} numberOfLines={1}>
            {direction}
          </Text>
        </View>
        <Text style={s.station} numberOfLines={1}>
          {item.stationName}
        </Text>
      </View>
      <Text style={s.time} numberOfLines={1}>
        {time}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title} 위젯에서 삭제`}
        disabled={disabled}
        onPress={onRemove}
        style={s.remove}
      >
        <SymbolView
          name={{ ios: 'minus.circle', android: 'remove_circle_outline' }}
          size={19}
          tintColor={c.secondaryText}
        />
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.separator,
  },
  names: { flex: 1, gap: 4, minWidth: 0 },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontSize: 14, fontWeight: '500', color: c.text, maxWidth: '45%' },
  direction: { flex: 1, fontSize: 12, fontWeight: '400', color: c.bodyText },
  station: { fontSize: 11, color: c.secondaryText },
  time: {
    fontSize: 14,
    fontWeight: '500',
    color: c.accent,
    fontVariant: ['tabular-nums'],
    maxWidth: 95,
  },
  remove: { width: 40, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
});
