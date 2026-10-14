import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, Platform } from 'react-native';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AlertRuntimeProvider } from '@/features/bus-alert/ui/alert-runtime-provider';
import AppTabs from '@/components/app-tabs';
import { MapTabVisibilityProvider } from '@/components/map-tab-visibility';
import { queryClient } from '@/shared/lib/query-client';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => subscription.remove();
  }, []);
  return (
    <GestureHandlerRootView style={{flex:1}}><QueryClientProvider client={queryClient}>
      <ThemeProvider value={DefaultTheme}>
        <AnimatedSplashOverlay />
        <MapTabVisibilityProvider>
          <AlertRuntimeProvider>
            <AppTabs />
          </AlertRuntimeProvider>
        </MapTabVisibilityProvider>
      </ThemeProvider>
    </QueryClientProvider></GestureHandlerRootView>
  );
}
