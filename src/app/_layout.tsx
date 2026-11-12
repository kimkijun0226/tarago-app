import { useWidgetSelection } from '@/features/widgets/model/widget-selection';
/** @fileoverview 앱 전체의 Provider와 최상위 Router를 연결하는 조립 지점. Query·알림 런타임·제스처를 한 번 설치한다. */
import { focusManager, onlineManager, QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as Network from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { RecoveryOverlay } from '@/shared/ui/recovery-overlay';
import { AlertRuntime } from '@/features/bus-alert/ui/alert-runtime';
import { appColors } from '@/shared/ui/theme';
import { queryClient } from '@/shared/lib/query-client';

SplashScreen.preventAutoHideAsync();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: appColors.accent,
    background: appColors.background,
    card: appColors.surface,
    text: appColors.text,
    border: appColors.separator,
    notification: appColors.brand,
  },
};

/** Provider 수명을 화면 전환과 분리하고 앱 활성 상태를 Query에 전달해 백그라운드 폴링을 중지한다. */
export default function RootLayout() {
  /** 앱 활성 상태를 Query에 연결해 백그라운드 폴링을 제어한다. 최초 한 번 등록하고 루트 해제 시 AppState 구독을 제거한다. */
  useEffect(() => {
    void useWidgetSelection.getState().initialize();
    focusManager.setFocused(AppState.currentState === 'active');

    /** 앱의 활성·백그라운드 전환을 Query focusManager에 전달하는 구독이다. 레이아웃 해제 시 제거한다. */
    const subscription = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );

    const updateOnline = (state: Network.NetworkState) => {
      if (state.isConnected === undefined && state.isInternetReachable === undefined) return;
      onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    };
    let receivedNetworkEvent = false;
    const network = Network.addNetworkStateListener((state) => {
      receivedNetworkEvent = true;
      updateOnline(state);
    });
    let mounted = true;
    void Network.getNetworkStateAsync().then((state) => {
      if (mounted && !receivedNetworkEvent) updateOnline(state);
    }).catch(() => {});
    return () => {
      mounted = false;
      network.remove();
      subscription.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={navigationTheme}>
          <AnimatedSplashOverlay />
          <AlertRuntime />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'default',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="subway-alerts" />
            <Stack.Screen name="alert-setup" options={{ animation: 'default' }} />
            <Stack.Screen name="notification-history" />
            <Stack.Screen name="widget-add" />
            <Stack.Screen name="widget-direction" />
            <Stack.Screen name="widget-map" options={{ gestureEnabled: false }} />
          </Stack>
          <RecoveryOverlay />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
