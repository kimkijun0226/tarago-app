/** @fileoverview Query의 갱신 시각으로 남은 초를 표시한다. 네트워크 재조회는 Query의 폴링에 맡긴다. */
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { BUS_ARRIVALS_REFRESH_INTERVAL } from '../model/use-bus-arrivals';

type Props = { updatedAt: number; fetching: boolean; onRefresh: () => void };

/** 초 단위 표시만 이 버튼 안에서 갱신해 버스 목록 전체를 매초 다시 그리지 않는다. */
export function ArrivalRefreshButton({ updatedAt, fetching, onRefresh }: Props) {
  /** 카운트다운 표시용 시각이다. 서버 데이터나 새로고침 타이머 역할을 하지 않는다. */
  const [now, setNow] = useState(Date.now);

  /** 앱이 활성화됐을 때만 표시 시각을 갱신하고 컴포넌트 해제 시 타이머를 제거한다. */
  useEffect(() => {
    /** 자동 재조회 없이 화면의 숫자만 갱신하는 간격 타이머다. */
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  /** Query가 마지막으로 성공한 시각부터 계산한 남은 초다. 실패·재시도 동안 0 아래로 내려가지 않는다. */
  const remaining = Math.max(
    0,
    Math.min(
      BUS_ARRIVALS_REFRESH_INTERVAL / 1000,
      Math.ceil((updatedAt + BUS_ARRIVALS_REFRESH_INTERVAL - now) / 1000),
    ),
  );

  return (
    <View style={styles.container}>
      <Text style={styles.updatedAt}>{updatedAt ? `${remaining}초 후 갱신` : '조회 중'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="버스 도착정보 새로고침"
        accessibilityState={{ busy: fetching, disabled: fetching }}
        disabled={fetching}
        onPress={onRefresh}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {fetching ? (
          <ActivityIndicator color={mapUi.blue} size="small" />
        ) : (
          <SymbolView
            name={{ ios: 'arrow.clockwise', android: 'refresh' }}
            size={16}
            tintColor={mapUi.blue}
          />
        )}
        <Text style={styles.buttonText}>새로고침</Text>
      </Pressable>
    </View>
  );
}

/** 목록과 겹치지 않는 시트 하단 갱신 행이다. */
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: mapUi.separator,
    backgroundColor: mapUi.background,
  },
  button: {
    minWidth: 44,
    minHeight: 44,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 13, fontWeight: '500', color: mapUi.blue },
  updatedAt: { color: mapUi.secondaryText, fontSize: 12 },
  pressed: { opacity: 0.65 },
});
