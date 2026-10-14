import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAppTheme } from '@/shared/ui/design-system';
import { useMapTabVisibility } from '@/components/map-tab-visibility';

/**
 * iOS·Android에서 지도와 알림 화면을 네이티브 탭으로 연결한다.
 *
 * 탭 색상은 시스템 색상 모드와 공통 테마 값을 사용한다.
 */
export default function AppTabs() {
  const { colors } = useAppTheme();
  const { isMapTabHidden } = useMapTabVisibility();

  return (
    <NativeTabs
      hidden={isMapTabHidden}
      backgroundColor={colors.surface}
      indicatorColor={colors.accentSurface}
      tintColor={colors.accent}
      iconColor={{ default: colors.secondaryText, selected: colors.accent }}
      labelStyle={{ default: { color: colors.secondaryText }, selected: { color: colors.accent } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>지도</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'map', selected: 'map.fill' }}
          md="map"
        />
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
