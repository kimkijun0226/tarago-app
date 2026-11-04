import { useState } from 'react';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { appColors as c } from '@/shared/ui/theme';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { useWidgetArrival } from '../model/use-widget-arrival';
import type { WidgetTarget } from '../model/widget-configuration';

/** 홈 위젯과 동일한 작은 2×2, 가로 4×2, 큰 3×4 배치를 표시한다. */
export function WidgetPreviews({ items }: { items: WidgetTarget[] }) {
  return (
    <View style={s.section}>
      <Text style={s.heading}>미리보기</Text>
      <Text style={s.label}>작은 위젯 · 최대 4개</Text>
      <Preview items={items} family="small" />
      <Text style={s.label}>가로 위젯 · 최대 8개</Text>
      <Preview items={items} family="medium" />
      <Text style={s.label}>큰 위젯 · 최대 12개</Text>
      <Preview items={items} family="large" />
    </View>
  );
}
function Preview({
  items,
  family,
}: {
  items: WidgetTarget[];
  family: 'small' | 'medium' | 'large';
}) {
  const small = family === 'small';
  const columns = small ? 2 : family === 'medium' ? 4 : 3;
  const rows = family === 'large' ? 4 : 2;
  const [width, setWidth] = useState(small ? 170 : 360);
  const height = family === 'medium' ? width / 2 : width;
  const diameter = Math.min(
    (width - 20 - (columns - 1) * 10) / columns,
    (height - 30 - (rows - 1) * 10) / rows,
  );
  return (
    <View
      style={[s.widget, small ? s.small : family === 'medium' ? s.medium : s.large]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {Array.from({ length: rows }, (_, row) => (
        <View key={row} style={s.row}>
          {Array.from({ length: columns }, (_, column) => {
            const item = items[row * columns + column];
            return (
              <View key={column} style={s.slot}>
                {item ? (
                  <Arrival item={item} diameter={diameter} />
                ) : (
                  <View style={[s.ring, s.empty, { width: diameter }]} />
                )}
              </View>
            );
          })}
        </View>
      ))}
      <View style={s.refresh}>
        <SymbolView
          name={{ ios: 'arrow.clockwise', android: 'refresh' }}
          size={10}
          tintColor={c.accent}
        />
      </View>
    </View>
  );
}
function Arrival({ item, diameter }: { item: WidgetTarget; diameter: number }) {
  const { direction, time, color, remainingSeconds } = useWidgetArrival(item, false);
  const minutes = time.match(/\d+분/)?.[0];
  const timer =
    remainingSeconds !== null && remainingSeconds > 0 && remainingSeconds <= 300
      ? `${Math.floor(remainingSeconds / 60)}:${String(Math.floor(remainingSeconds % 60)).padStart(2, '0')}`
      : null;
  const label =
    timer ??
    (minutes
      ? `${/시간표|예상|약/.test(time) ? '약 ' : ''}${minutes}`
      : (['곧 도착', '진입', '도착'].find((value) => time.includes(value)) ?? '—'));
  return (
    <View
      style={[s.ring, s.activeRing, { width: diameter }]}
      accessibilityLabel={`${item.title} ${direction} ${time}`}
    >
      <Image
        source={{ uri: ringImage(color, remainingSeconds, label === '—') }}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        cachePolicy="memory"
        transition={150}
        accessible={false}
      />
      <View style={s.timeCover}>
        <Text style={[s.time, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View
        style={[s.identity, { top: 16, bottom: 6, left: diameter * 0.14, right: diameter * 0.14 }]}
      >
        <View style={s.identityTitle}>
          <TransportIcon transport={item.transport} size={9} tintColor={color} />
          <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {item.title.replace(/번$/, '')}
          </Text>
        </View>
        {item.transport === 'subway' && (
          <Text style={s.station} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {item.stationName.replace(/역$/, '')}역
          </Text>
        )}
        <Text style={s.direction} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
          {direction.split(' · ').at(-1)?.trim()}
          {/시간표|예상|약/.test(time) ? (time.includes('시간표') ? ' · 시간표' : ' · 예상') : ''}
        </Text>
      </View>
    </View>
  );
}
/** 원은 네이티브 위젯과 동일하게 5분 기준으로 분마다 오른쪽부터 비워진다. */
function ringImage(color: string, seconds: number | null, unavailable: boolean) {
  const tint = /^#[0-9a-f]{6}$/i.test(color) ? color : '#2869DB';
  const progress = seconds === null ? 1 : Math.min(1, Math.max(0, Math.ceil(seconds / 60) / 5));
  const circumference = 2 * Math.PI * 46;
  const track = 0.82 * circumference;
  const offset = -(0.09 + 0.82 * (1 - progress)) * circumference;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><g fill="none" stroke="${tint}" stroke-width="5.5" stroke-linecap="round" transform="rotate(-90 50 50)"><circle cx="50" cy="50" r="46" opacity="0.12" stroke-dasharray="${track} ${circumference}" stroke-dashoffset="${-0.09 * circumference}"/>${progress > 0 ? `<circle cx="50" cy="50" r="46" opacity="${unavailable ? 0.25 : 1}" stroke-dasharray="${track * progress} ${circumference}" stroke-dashoffset="${offset}"/>` : ''}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const s = StyleSheet.create({
  section: { paddingTop: 24, gap: 12 },
  heading: { fontSize: 17, fontWeight: '600', color: c.text },
  label: { fontSize: 12, color: c.secondaryText },
  widget: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.separator,
    padding: 10,
    paddingBottom: 22,
    gap: 10,
  },
  small: { width: 170, height: 170, marginBottom: 8 },
  medium: { width: '100%', aspectRatio: 2, maxWidth: 360 },
  large: { width: '100%', aspectRatio: 1, maxWidth: 360 },
  refresh: { position: 'absolute', right: 10, bottom: 6 },
  row: { flex: 1, flexDirection: 'row', gap: 10 },
  slot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: '90%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeRing: { borderWidth: 0 },
  empty: { borderColor: '#EAF0F7' },
  timeCover: {
    position: 'absolute',
    top: -5,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  time: { fontSize: 11, lineHeight: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  identity: { position: 'absolute', alignItems: 'center', justifyContent: 'center', gap: 1 },
  identityTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    maxWidth: '100%',
  },
  title: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '600',
    color: c.text,
    maxWidth: '100%',
    lineHeight: 12,
  },
  station: { fontSize: 8, fontWeight: '500', color: c.text, maxWidth: '100%', lineHeight: 10 },
  direction: { fontSize: 6, lineHeight: 8, color: c.secondaryText, maxWidth: '100%' },
});
