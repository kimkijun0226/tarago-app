import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SkeletonBlock } from './loading-skeleton';
import { appColors } from './theme';
import { fadeOut } from './motion';

const ArrivalTimePending = createContext(false);
const ArrivalTimeRefreshing = createContext(false);

/** Keep the tab mounted and reserve the entrance treatment for arrival times. */
export function ArrivalTimeEntrance({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState(true);
  useFocusEffect(useCallback(() => {
    setPending(true);
    const timer = setTimeout(() => setPending(false), 1_000);
    return () => clearTimeout(timer);
  }, []));
  return <ArrivalTimePending.Provider value={pending}>{children}</ArrivalTimePending.Provider>;
}

export function ArrivalTimeRefresh({ refreshing, children }: { refreshing: boolean; children: ReactNode }) {
  return <ArrivalTimeRefreshing.Provider value={refreshing}>{children}</ArrivalTimeRefreshing.Provider>;
}

export function useArrivalTimeRefreshing() { return useContext(ArrivalTimeRefreshing); }

export function useArrivalTimeEntering() { return useContext(ArrivalTimePending); }

export function ArrivalTimeSlot({ children, pending = false, animateEntrance = true, indicator = false, alignRight = false }: { children: ReactNode; pending?: boolean; animateEntrance?: boolean; indicator?: boolean; alignRight?: boolean }) {
  const entering = useArrivalTimeEntering();
  const showSkeleton = (animateEntrance && entering) || pending;
  return (
    <View style={styles.slot}>
      <View style={showSkeleton ? styles.hidden : undefined}
        accessibilityElementsHidden={showSkeleton}
        importantForAccessibility={showSkeleton ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {showSkeleton && (
        <Animated.View pointerEvents="none" exiting={fadeOut} style={styles.overlay}>
          {indicator ? <ArrivalTimeIndicator alignRight={alignRight} /> : <SkeletonBlock width="100%" height={10} />}
        </Animated.View>
      )}
    </View>
  );
}

export function ArrivalTimeIndicator({ alignRight = false }: { alignRight?: boolean } = {}) {
  return (
    <ActivityIndicator size="small" color={appColors.secondaryText}
      accessibilityLabel="도착시간 조회 중" style={[styles.indicator, alignRight && styles.right]} />
  );
}

const styles = StyleSheet.create({
  slot: { position: 'relative', minHeight: 16 },
  right: { alignSelf: 'flex-end' },
  indicator: { alignSelf: 'center', transform: [{ scale: 0.65 }] },
  hidden: { opacity: 0 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'center' },
});
