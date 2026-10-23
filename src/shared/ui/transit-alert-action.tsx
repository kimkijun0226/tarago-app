/** Phosphor 기반 로컬 에셋으로 시간·위치 알림 진입을 일관되게 표시한다. */
import { Image, Pressable, StyleSheet, View } from 'react-native';

const images = {
  time: require('../../../assets/images/alert-actions/time.png'),
  location: require('../../../assets/images/alert-actions/location.png'),
};

export function TransitAlertAction({
  kind,
  label,
  onPress,
  iconSize = 23,
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
      style={styles.touch}
    >
      {({ pressed }) => (
        <View style={[styles.face, pressed && styles.pressed]}>
          <Image
            source={images[kind]}
            style={{ width: iconSize, height: iconSize }}
            accessible={false}
          />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  face: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.65 },
});
