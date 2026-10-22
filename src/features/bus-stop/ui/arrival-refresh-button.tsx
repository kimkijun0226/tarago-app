/** @fileoverview Query의 갱신 시각으로 남은 초를 표시한다. 네트워크 재조회는 Query의 폴링에 맡긴다. */
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { BUS_ARRIVALS_REFRESH_INTERVAL } from '../model/use-bus-arrivals';

type Props = { updatedAt: number; fetching: boolean; onRefresh: () => void };

/** 초 단위 표시만 이 버튼 안에서 갱신해 버스 목록 전체를 매초 다시 그리지 않는다. */
export function ArrivalRefreshButton({ updatedAt, fetching, onRefresh }: Props) {
  /** 홈 인디케이터 위에 버튼을 배치하기 위한 안전 영역이다. */
  const insets = useSafeAreaInsets();

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
    <View pointerEvents="box-none" style={[styles.container, { bottom: insets.bottom + 14 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="버스 도착정보 새로고침"
        accessibilityState={{ busy: fetching, disabled: fetching }}
        disabled={fetching}
        onPress={onRefresh}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        {fetching ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View style={styles.ring}>
            <Text style={styles.number}>{remaining}</Text>
            <Text style={styles.arrow}>↻</Text>
          </View>
        )}
      </Pressable>
      <Text style={styles.updatedAt}>
        {updatedAt
          ? `${new Date(updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 갱신`
          : '조회 중'}
      </Text>
    </View>
  );
}

/** 지도 위 버튼의 고정 스타일이다. 화면 안전 영역만 렌더링에서 합성한다. */
const styles = StyleSheet.create({
  container: { position: 'absolute', right: 20, alignItems: 'center', gap: 5 },
  button: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: mapUi.blue,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    boxShadow: '0px 4px 0px #D9285020',
  },
  ring: {
    width: 31,
    height: 31,
    borderRadius: 16,
    borderColor: '#FFFFFF',
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  arrow: {
    color: '#FFFFFF',
    fontSize: 18,
    position: 'absolute',
    right: -9,
    bottom: -3,
    backgroundColor: mapUi.blue,
  },
  updatedAt: { color: mapUi.secondaryText, fontSize: 10 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
});
