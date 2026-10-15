/** @fileoverview 한 방면의 실시간 도착 열차와 운행 상태·알림 설정 진입을 표시한다. */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { SubwayArrival } from '../api/get-subway-arrivals';
import { getArrivalTime } from '../model/subway-arrival-display';
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
  const trains = ended ? [] : arrivals;
  return (
    <View style={s.directionCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 상세 도착정보`}
        onPress={onDetail}
        style={s.directionHeader}
      >
        <Text style={s.directionTitle}>{label}</Text>
        <Text style={s.chevron}>›</Text>
      </Pressable>
      {(detailed ? trains : trains.slice(0, 2)).map((arrival) => {
        /** 현재 시각에 맞춰 계산한 도착 문구와 수신 지연 여부다. */
        const time = getArrivalTime(arrival, now, elapsed);
        return (
          <View key={arrival.id} style={s.train}>
            <Text style={s.trainDestination}>
              {arrival.destination ? `${arrival.destination}행` : '행선지 미제공'}
              {arrival.isLastTrain ? ' · 막차' : ''}
            </Text>
            <Text style={[s.trainTime, { color: time.stale ? GRAY : '#E44136' }]}>{time.text}</Text>
            {detailed && arrival.locationMessage ? (
              <Text style={s.trainLocation}>{arrival.locationMessage}</Text>
            ) : null}
          </View>
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
  directionHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingBottom: 8,
  },
  directionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#444' },
  chevron: { fontSize: 24, color: '#555' },
  train: { gap: 3, paddingTop: 10 },
  trainDestination: { fontSize: 12, color: '#555' },
  trainTime: { fontSize: 14, fontWeight: '600' },
  trainLocation: { fontSize: 12, color: GRAY },
  alertButton: { marginTop: 14, minHeight: 40, justifyContent: 'center' },
  link: { fontSize: 14, color: BLUE },
});
