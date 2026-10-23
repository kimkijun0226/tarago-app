/** @fileoverview iOS·Android의 지도/알림 탭 조립. 공통 팔레트의 네이티브 탭을 사용하며 숨김 상태는 앱 스토어에서 읽는다. */
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { router, useGlobalSearchParams, usePathname, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';

import { appColors } from '@/shared/ui/theme';
import { useAppStore } from '@/shared/model/app-store';

/**
 * iOS·Android에서 지도와 알림 화면을 네이티브 탭으로 연결한다.
 * 네이티브 동작을 유지하고 선택 색상과 표면을 공통 팔레트에 맞춘다.
 */
export default function TabsLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const navigation = useRootNavigationState();
  const started = useRef(false);

  // 일반 실행의 첫 화면만 바꾸고 지도 탭 선택이나 알림 딥링크는 유지한다.
  useEffect(() => {
    if (started.current || !navigation?.key) return;
    started.current = true;
    if (pathname === '/' && Object.keys(params).length === 0) router.replace('/alerts');
  }, [navigation?.key, pathname, params]);

  /** 검색이나 상세 시트가 열려 앱 탭을 숨겨야 하는지 나타내는 공용 UI 값이다. */
  const isMapTabHidden = useAppStore((state) => state.isMapTabHidden);

  return (
    <NativeTabs
      hidden={isMapTabHidden}
      tintColor={appColors.accent}
      backgroundColor={appColors.surface}
      disableTransparentOnScrollEdge
      iconColor={{ default: appColors.secondaryText, selected: appColors.accent }}
      labelStyle={{
        default: { color: appColors.secondaryText, fontSize: 11, fontWeight: '600' },
        selected: { color: appColors.accent, fontSize: 11, fontWeight: '700' },
      }}
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
