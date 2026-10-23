import { SymbolView } from 'expo-symbols';

export const TRANSPORT_SYMBOLS = {
  bus: { ios: 'bus.fill', android: 'directions_bus' },
  subway: { ios: 'tram.fill', android: 'tram' },
} as const;

/** 나의 알림에서 쓰는 교통수단 심벌을 모든 화면에서 재사용한다. */
export function TransportIcon({ transport, size = 20, tintColor }: {
  transport: 'bus' | 'subway'; size?: number; tintColor: string;
}) {
  return <SymbolView name={TRANSPORT_SYMBOLS[transport]} size={size} tintColor={tintColor} />;
}
