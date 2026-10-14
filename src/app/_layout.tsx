import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, Platform } from 'react-native';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AlertRuntimeProvider } from '@/features/bus-alert/ui/alert-runtime-provider';
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
            <Stack screenOptions={{headerShown:false}}><Stack.Screen name="(tabs)" /><Stack.Screen name="subway-alerts" /></Stack>
          </AlertRuntimeProvider>
        </MapTabVisibilityProvider>
      </ThemeProvider>
    </QueryClientProvider></GestureHandlerRootView>
  );
}
