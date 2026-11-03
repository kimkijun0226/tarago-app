import { StyleSheet, View } from 'react-native';
import type { AlertKind } from '../model/alert-form';
import { EmptyAlertCard } from './alert-components';

/** 위젯 추가처럼 두 선택지가 남은 높이를 반씩 차지하고 바로 지도 선택으로 이어진다. */
export function AlertKindSelector({
  transport,
  disabled,
  onChange,
}: {
  transport: 'bus' | 'subway';
  disabled: boolean;
  onChange: (value: AlertKind) => void;
}) {
  return (
    <View style={s.options}>
      {(['time', 'location'] as const).map((kind) => (
        <EmptyAlertCard
          key={kind}
          transport={transport}
          kind={kind}
          disabled={disabled}
          onStart={() => onChange(kind)}
        />
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  options: { flex: 1, gap: 12 },
});
