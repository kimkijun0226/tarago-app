/** @fileoverview 선택 장소의 이름·주소와 지하철 도착정보 진입 동작을 표시한다. */

import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { Place } from '../api/mobility';
import { isSubwayPlace } from '../model/place-kind';
import { useAppTheme } from '@/shared/ui';
import { mapUi } from '@/shared/ui/map-design-tokens';

type Props = {
  place: Place;
  onSheetHeight: (height: number) => void;
  onClose: () => void;
  onSubway: () => void;
};

/**
 * 선택 장소 상세의 표시와 레이아웃 높이 전달만 담당한다.
 * @param props 장소와 닫기·지하철 진입 동작.
 * @returns 지도 아래 장소 상세 카드. 동작은 부모의 최신 상태를 사용하므로 메모화하지 않는다.
 */
export function PlaceDetail({ place, onSheetHeight, onClose, onSubway }: Props) {
  /** 공통 앱 색상을 읽어 지도 전용 팔레트의 기본값으로 사용한다. */
  const { colors: appColors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const bottomGap = Math.max(12, insets.bottom);

  /** 지도 검색 화면의 색상 토큰을 기본 테마에 덮어써 지도·카드·검색창의 색을 일치시킨다. */
  const colors = {
    ...appColors,
    accent: mapUi.blue,
    accentSurface: mapUi.blueSurface,
    surface: mapUi.background,
    background: mapUi.background,
    text: mapUi.text,
    secondaryText: mapUi.secondaryText,
    separator: mapUi.border,
    secondarySurface: mapUi.separator,
  };
  return (
    <View
      onLayout={(event) => onSheetHeight(event.nativeEvent.layout.height + bottomGap)}
      style={{
        position: 'absolute',
        bottom: bottomGap,
        left: 12,
        right: 12,
        backgroundColor: colors.surface,
        borderRadius: 16,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 16,
        gap: 4,
      }}
    >
      <View
        style={{
          width: 44,
          height: 4,
          borderRadius: 12,
          backgroundColor: colors.borderStrong,
          alignSelf: 'center',
          marginBottom: 8,
        }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: colors.text, fontSize: 20, lineHeight: 28, fontWeight: '600', flex: 1 }}>
          {place.name.replace(/\[.*?\]/g, '')}
        </Text>
        <Pressable
          accessibilityLabel="장소 닫기"
          onPress={onClose}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SymbolView name={{ ios: 'xmark', android: 'close' }} size={20} tintColor={colors.text} />
        </Pressable>
      </View>
      <Text style={{ color: colors.secondaryText, fontSize: 15 }}>{place.address}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {isSubwayPlace(place) ? (
          <Pressable
            accessibilityRole="button"
            onPress={onSubway}
            style={{
              paddingHorizontal: 14,
              minHeight: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: mapUi.accentBorder,
              backgroundColor: colors.accentSurface,
              borderBottomWidth: 1,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>
              실시간 도착
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
