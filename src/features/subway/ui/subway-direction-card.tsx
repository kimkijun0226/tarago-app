/** @fileoverview 한 방면의 실시간 도착 열차와 운행 상태·알림 설정 진입을 표시한다. */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SubwayArrival } from '../api/get-subway-arrivals';
import { getArrivalTime, getUpcomingTrains } from '../model/subway-arrival-display';
import { mapUi } from '@/shared/ui/map-design-tokens';

/** 지하철 링크·강조 표시에 쓰는 지도 공통 파란색이다. 지연·보조 정보와 비활성 선택에 사용하는 회색이다. */
const BLUE = mapUi.blue,
  GRAY = '#919191';
type Props = {
  arrivals: SubwayArrival[];
  label: string;
  status: string;
  now: number;
  elapsed: number;
  detailed: boolean;
  onDetail: () => void;
  onAlert?: () => void;
};

/**
 * 운행 종료 뒤 오래된 열차는 숨기고 일반 모드에서는 최대 두 대를 표시한다.
 * @param props 같은 방면의 열차·공식 운행 상태·현재 시각과 상세/알림 진입 동작.
 * @returns 방면별 도착 카드. 초마다 바뀌는 표시값은 직접 계산하며 별도 메모화를 추가하지 않는다.
 */
export function SubwayDirectionCard({
  arrivals,
  label,
  status,
  now,
  elapsed,
  detailed,
  onDetail,
  onAlert,
}: Props) {
  /** 공식 운행 종료 상태이고 유효한 최근 열차도 없는 방면인지 판단한다. */
  const ended =
    status === '운행종료' &&
    !arrivals.some((arrival) => !getArrivalTime(arrival, now, elapsed).stale);

  /** 운행 종료가 확정된 경우 오래된 열차를 숨기고 그 외에는 서버 열차를 유지한다. */
  const trains = ended ? [] : getUpcomingTrains(arrivals);
  return (
    <View style={s.directionCard}>
      {(detailed ? trains : trains.slice(0, 2)).map((arrival) => {
        /** 현재 시각에 맞춰 계산한 도착 문구와 수신 지연 여부다. */
        const time = getArrivalTime(arrival, now, elapsed);
        const isExpress = /급행|특급/.test(arrival.trainType);
        return (
          <Pressable
            key={arrival.id}
            style={s.train}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${arrival.destination || '열차'}${isExpress ? ' 급행' : ''} 상세 도착정보`}
            onPress={onDetail}
          >
            <Text style={[s.trainDestination, isExpress && s.express]} numberOfLines={1}>
              {arrival.destination ? `${arrival.destination}행` : '행선지 미제공'}
              {isExpress ? '(급)' : ''}
              {arrival.isLastTrain ? ' · 막차' : ''}
            </Text>
            {time.text ? <Text style={s.trainTime}>{time.text}</Text> : null}
          </Pressable>
        );
      })}
      {!trains.length ? <Text style={s.serviceStatus}>{status}</Text> : null}
      {detailed && onAlert ? (
        <Pressable onPress={onAlert} accessibilityRole="button" style={s.alertButton}>
          <Text style={s.link}>도착 알림 설정</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 이 파일의 지하철 표시 요소가 사용하는 고정 스타일을 모듈 범위에서 한 번 만든다. */
const s = StyleSheet.create({
  serviceStatus: { color: GRAY, fontSize: 15, textAlign: 'center', marginTop: 18 },
  directionCard: {
    flex: 1,
    minHeight: 108,
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 10,
  },
  train: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
  },
  trainDestination: { flex: 1, fontSize: 14, color: '#555' },
  express: { color: '#E44136' },
  trainTime: { flexShrink: 0, fontSize: 14, fontWeight: '600', color: '#E44136', fontVariant: ['tabular-nums'] },
  alertButton: { marginTop: 14, minHeight: 40, justifyContent: 'center' },
  link: { fontSize: 14, color: BLUE },
});
