import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { getNotificationHistory } from '../api/alerts';
import { useHistoryReadCursor } from '../model/notification-read-state';
import { alertColors as colors } from './alert-design';
/** 헤더는 배경 없이 종과 읽지 않은 내역의 점만 표시한다. */
export function AlertHistoryBell({ disabled }: { disabled: boolean }) {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const latest = useQuery({
    queryKey: ['alerts', 'history', 'latest'],
    queryFn: ({ signal }) => getNotificationHistory(undefined, signal),
    enabled: focused,
    staleTime: 15_000,
    retry: false,
  });
  const read = useHistoryReadCursor();
  const id = latest.data?.items[0]?.id;
  const unread = !!id && read.data !== undefined && BigInt(id) > BigInt(read.data);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? '읽지 않은 알림 내역 보기' : '알림 내역 보기'}
      disabled={disabled}
      onPress={() => router.push('/notification-history')}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}
    >
      <SymbolView
        name={{ ios: 'bell', android: 'notifications_none' }}
        size={23}
        tintColor={colors.accent}
      />
      {unread && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 7,
            top: 6,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.brand,
          }}
        />
      )}
    </Pressable>
  );
}
