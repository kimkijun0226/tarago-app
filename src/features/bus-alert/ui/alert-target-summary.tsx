import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { alertColors as c } from './alert-design';

/** 설정 대상과 현재 도착정보를 한 카드에서 확인한다. */
export function AlertTargetSummary({
  transport,
  title,
  subtitle,
  children,
}: {
  transport: 'bus' | 'subway';
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <View style={s.card}>
      <View style={s.heading}>
        <TransportIcon transport={transport} size={28} tintColor={c.accent} />
        <View style={s.text}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.separator,
    backgroundColor: c.surface,
    gap: 12,
  },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '600', color: c.text },
  subtitle: { fontSize: 13, lineHeight: 19, color: c.secondaryText },
});
