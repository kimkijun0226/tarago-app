import { TransportIcon } from '@/shared/ui/transport-icon';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { Place } from '../api/mobility';
import { searchTransport } from '../model/search-transport';

/** 글자 없이 형태와 색으로 검색 대상의 교통수단을 구분한다. */
export function SearchPlaceKind({ place }: { place: Place }) {
  const { kind, label, color } = searchTransport(place);
  return (
    <View accessible accessibilityLabel={label} style={styles.badge}>
      {kind === 'bus' || kind === 'subway' ? (
        <TransportIcon transport={kind} size={19} tintColor={color} />
      ) : (
        <SymbolView name={kind === 'exit'
          ? { ios: 'rectangle.portrait.and.arrow.right', android: 'exit_to_app' }
          : { ios: 'mappin', android: 'location_on' }} size={19} tintColor={color} />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  badge: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center',
 },
});
