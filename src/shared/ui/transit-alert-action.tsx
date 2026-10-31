import { Pressable } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { appColors } from './theme';

/** 시간·위치 알림의 터치 영역은 유지하고 장식 없이 선형 심벌로 표시한다. */
export function TransitAlertAction({
  kind,
  label,
  onPress,
  iconSize = 22,
}: {
  kind: 'time' | 'location';
  label: string;
  onPress: () => void;
  iconSize?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 14,
        backgroundColor: pressed ? appColors.strongSurface : appColors.accentSurface,
        marginLeft: 4,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <SymbolView
        name={
          kind === 'time'
            ? { ios: 'clock', android: 'schedule' }
            : { ios: 'location', android: 'near_me' }
        }
        size={Math.min(iconSize, 24)}
        tintColor={appColors.accent}
        weight="regular"
      />
    </Pressable>
  );
}
