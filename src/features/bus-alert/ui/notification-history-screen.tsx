/** @fileoverview 서버가 발송한 알림을 최신순으로 모아 보여준다. */
import { useCallback } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { AlertIconButton, AlertNotice } from './alert-components';
import { alertColors as colors } from './alert-design';
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
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 18,
        }}
      >
        <AlertIconButton
          name={{ ios: 'chevron.left', android: 'arrow_back' }}
          label="알림 내역 닫기"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/alerts'))}
        />
        <Text
          accessibilityRole="header"
          style={{ flex: 1, fontSize: 26, fontWeight: '700', color: colors.text }}
        >
          알림 내역
        </Text>
        <AlertIconButton
          name={{ ios: 'arrow.clockwise', android: 'refresh' }}
          label="알림 내역 새로고침"
          disabled={history.isFetching}
          onPress={() => void refetch()}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 12, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={history.isRefetching && !history.isFetchingNextPage}
            onRefresh={() => void refetch()}
            tintColor={colors.accent}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (history.hasNextPage && !history.isFetching) void history.fetchNextPage();
        }}
        ListHeaderComponent={
          history.isError ? (
            <AlertNotice action="다시 시도" onAction={() => void refetch()}>
              알림 내역을 불러오지 못했어요.
            </AlertNotice>
          ) : null
        }
        ListEmptyComponent={
          history.isPending ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : !history.isError ? (
            <View
              style={{
                minHeight: 220,
                borderWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: colors.accentBorder,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
              }}
            >
              <SymbolView
                name={{ ios: 'bell', android: 'notifications_none' }}
                size={32}
                tintColor={colors.accent}
              />
              <Text style={{ color: colors.secondaryText, fontSize: 14 }}>
                아직 알림 내역이 없어요
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          history.isFetchingNextPage ? (
            <ActivityIndicator color={colors.accent} style={{ padding: 16 }} />
          ) : null
        }
        renderItem={({ item }) => (
          <View
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
                <SymbolView
                  name={
                    item.transport === 'bus'
                      ? { ios: 'bus.fill', android: 'directions_bus' }
                      : { ios: 'tram.fill', android: 'subway' }
                  }
                  size={21}
                  tintColor={colors.accent}
                />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
                  {item.title}
                </Text>
                <Text style={{ color: colors.secondaryText, fontSize: 12 }}>
                  {time.format(new Date(item.sentAt))} ·{' '}
                  {item.kind === 'location' ? '위치 알림' : '시간 알림'}
                </Text>
              </View>
            </View>
            <Text style={{ color: colors.bodyText, fontSize: 14, lineHeight: 22 }}>
              {item.body}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
