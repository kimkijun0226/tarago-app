import { Pressable, Text, View } from 'react-native';
import { TransportIcon } from './transport-icon';
import { appColors as c } from './theme';

/** 목록과 위젯 설정에서 같은 교통수단 선택 상태를 표시한다. */
export function TransportSelector({ value, onChange, disabled = false }: {
  value: 'bus' | 'subway';
  onChange: (value: 'bus' | 'subway') => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {(['bus', 'subway'] as const).map((transport) => (
        <Pressable
          key={transport}
          accessibilityRole="button"
          accessibilityState={{ selected: value === transport, disabled }}
          disabled={disabled}
          onPress={() => onChange(transport)}
          style={({ pressed }) => ({
            shadowColor: '#203550', shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04, shadowRadius: 8, elevation: 1,
            flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center',
            justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1,
            borderColor: value === transport ? c.accentBorder : c.separator,
            backgroundColor: value === transport ? c.accentSurface : c.surface,
            opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          })}
        >
          <TransportIcon transport={transport} size={20} tintColor={value === transport ? c.accent : c.secondaryText} />
          <Text style={{ fontSize: 15, fontWeight: '600', color: value === transport ? c.accent : c.bodyText }}>
            {transport === 'bus' ? '버스' : '지하철'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
