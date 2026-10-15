/** @fileoverview iOS·Android의 지도/알림 탭 조립. 색상은 공통 라이트 테마, 숨김 상태는 앱 스토어에서 읽는다. */
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAppStore } from '@/shared/model/app-store';
import { useAppTheme } from '@/shared/ui';

/**
 * iOS·Android에서 지도와 알림 화면을 네이티브 탭으로 연결한다.
 * 탭 색상은 기기 다크 모드와 관계없이 공통 라이트 테마를 사용한다.
 */
export default function TabsLayout() {
  /** 현재 화면의 배경·텍스트·버튼에 적용할 공통 라이트 색상이다. */
  const { colors } = useAppTheme();

  /** 검색이나 상세 시트가 열려 앱 탭을 숨겨야 하는지 나타내는 공용 UI 값이다. */
  const isMapTabHidden = useAppStore((state) => state.isMapTabHidden);

  return (
    <NativeTabs
      hidden={isMapTabHidden}
      backgroundColor={colors.surface}
      indicatorColor={colors.accentSurface}
      tintColor={colors.accent}
      iconColor={{ default: colors.secondaryText, selected: colors.accent }}
      labelStyle={{ default: { color: colors.secondaryText }, selected: { color: colors.accent } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>지도</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="alerts">
        <NativeTabs.Trigger.Label>알림</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bell', selected: 'bell.fill' }}
          md="notifications"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
