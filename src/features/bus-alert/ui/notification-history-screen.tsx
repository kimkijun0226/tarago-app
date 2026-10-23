import { AppHeader } from '@/shared/ui/app-header';
import { TransportIcon } from '@/shared/ui/transport-icon';
/** @fileoverview 서버가 발송한 알림을 최신순으로 모아 보여준다. */
import { useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { ActivityIndicator, AppState, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { AlertIconButton } from './alert-components';
import { alertColors as colors } from './alert-design';
import { useMarkHistoryRead } from '../model/notification-read-state';
import { openAlertTarget } from '../model/open-alert-target';
import { useNotificationHistory } from '../model/use-notification-history';
const time = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
export function NotificationHistoryScreen() {
  const history = useNotificationHistory();
  const { refetch } = history;
  const { mutate: markRead } = useMarkHistoryRead();
  const newest = history.data?.pages[0]?.items[0]?.id;
  useFocusEffect(
    useCallback(() => {
      const mark = () => {
        if (newest && AppState.currentState === 'active') markRead(newest);
      };
      mark();
      const listener = AppState.addEventListener('change', mark);
      return () => listener.remove();
    }, [newest, markRead]),
  );
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 18,
        }}
      >
        <AppHeader
          title="알림 내역"
          backLabel="알림 내역 닫기"
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/alerts'))}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 12, flexGrow: 1 }}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (history.hasNextPage && !history.isFetching) void history.fetchNextPage();
        }}
        ListEmptyComponent={
          history.isPending ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={{ minHeight: 220, alignItems: 'center', justifyContent: 'center' }}>
              {history.isError ? (
                <AlertIconButton
                  plain
                  name={{ ios: 'wifi.exclamationmark', android: 'wifi_off' }}
                  label="연결 오류, 다시 시도"
                  onPress={() => void refetch()}
                />
              ) : (
                <SymbolView
                  name={{ ios: 'bell.slash', android: 'notifications_none' }}
                  size={32}
                  tintColor={colors.tertiaryText}
                  accessibilityLabel="알림 내역 없음"
                />
              )}
            </View>
          )
        }

        ListFooterComponent={
          history.isFetchingNextPage ? (
            <ActivityIndicator color={colors.accent} style={{ padding: 16 }} />
          ) : history.isFetchNextPageError ? (
            <AlertIconButton
              plain
              name={{ ios: 'wifi.exclamationmark', android: 'wifi_off' }}
              label="이전 내역 다시 불러오기"
              onPress={() => void history.fetchNextPage()}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title} 대상으로 이동`}
            disabled={!item.alertId}
            onPress={() => {
              if (item.alertId)
                void openAlertTarget(
                  item.transport,
                  item.alertId,
                  `history:${item.id}:${Date.now()}`,
                );
            }}
            style={{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderBottomWidth: 3,
              borderColor: colors.separator,
              borderRadius: 24,
              padding: 18,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 15,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.accentSurface,
                }}
              >
                <TransportIcon transport={item.transport} size={21} tintColor={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                  {item.title}
                </Text>
                <Text style={{ color: colors.secondaryText, fontSize: 12 }}>
                  {time.format(new Date(item.sentAt))} ·{' '}
                  {item.kind === 'location' ? '위치 알림' : '예약 알림'}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.bodyText, fontSize: 14, lineHeight: 22 }}>
              {item.body}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
