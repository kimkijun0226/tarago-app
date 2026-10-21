/** @fileoverview iOS·Android의 지도/알림 탭 조립. OS 기본 탭 모양을 사용하며 숨김 상태는 앱 스토어에서 읽는다. */
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAppStore } from '@/shared/model/app-store';

/**
 * iOS·Android에서 지도와 알림 화면을 네이티브 탭으로 연결한다.
 * 배경·아이콘·선택 효과는 OS 기본값을 사용한다.
 */
export default function TabsLayout() {
  /** 검색이나 상세 시트가 열려 앱 탭을 숨겨야 하는지 나타내는 공용 UI 값이다. */
  const isMapTabHidden = useAppStore((state) => state.isMapTabHidden);

  return (
    <NativeTabs hidden={isMapTabHidden}>
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
