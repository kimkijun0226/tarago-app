import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { isAxiosError } from 'axios';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import { useAppTheme } from '@/shared/ui/design-system';
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';

/** 서버 수신 이후 경과 시간도 반영하되 오래된 열차 정보를 도착 확정으로 표시하지 않는다. */
export function SubwayArrivalSheet({ stationName, onClose, onHeightChange, snap, onChangeSnap }: {
  stationName: string; onClose: () => void; onHeightChange: (height: number) => void;
  snap?: MapSheetSnap; onChangeSnap?: (snap: MapSheetSnap) => void;
}) {
  const { colors, type } = useAppTheme();
  const query = useSubwayArrivals(stationName);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const elapsed = query.data ? Math.max(0, Math.floor((now - Date.parse(query.data.fetchedAt)) / 1000)) : 0;
  const message = isAxiosError(query.error) && typeof query.error.response?.data?.message === 'string'
    ? query.error.response.data.message : '도착 정보를 불러오지 못했습니다.';
  return <MapBottomSheet onHeightChange={onHeightChange} snap={snap} onChangeSnap={onChangeSnap}>
    <BottomSheetScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 32 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}><Text accessibilityRole="header" style={{ ...type.title, color: colors.text }}>{stationName} · 지하철</Text>
          <Text style={{ ...type.footnote, color: colors.secondaryText }}>실시간 도착 · 15초마다 갱신</Text></View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="지하철 도착 정보 닫기" style={{ padding: 12 }}><Text style={{ color: colors.accent }}>닫기</Text></Pressable>
      </View>
      {query.isPending ? <ActivityIndicator color={colors.accent} /> : null}
      {query.isError ? <View style={{ gap: 8 }}><Text style={{ color: colors.danger }}>{message}</Text>
        <Pressable onPress={() => void query.refetch()} accessibilityRole="button" style={{ paddingVertical: 12 }}><Text style={{ color: colors.accent }}>다시 조회</Text></Pressable></View> : null}
      {query.data?.arrivals.length === 0 ? <Text style={{ color: colors.secondaryText }}>현재 제공되는 도착 정보가 없습니다. 수도권 서비스 대상 역인지 확인해주세요.</Text> : null}
      {query.data?.arrivals.map(arrival => {
        const seconds = arrival.etaSeconds === null ? null : Math.max(0, arrival.etaSeconds - elapsed);
        const old = !arrival.receivedAt || now - Date.parse(arrival.receivedAt) > 120_000;
        return <View key={arrival.id} style={{ gap: 6, padding: 16, borderRadius: 16, backgroundColor: colors.secondarySurface }}>
          <Text style={{ ...type.headline, color: colors.text }}>{arrival.lineName} · {arrival.direction}</Text>
          <Text style={{ color: colors.text }}>{arrival.destination ? `${arrival.destination}행` : '방면 정보 없음'}{arrival.trainType && arrival.trainType !== '일반' ? ` · ${arrival.trainType}` : ''}{arrival.isLastTrain ? ' · 막차' : ''}</Text>
          <Text style={{ ...type.headline, color: old ? colors.secondaryText : colors.accent }}>{old ? '갱신이 지연된 정보' : seconds && seconds > 0 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초 후` : arrival.arrivalMessage || '도착 시간 확인 중'}</Text>
          {arrival.locationMessage ? <Text style={{ ...type.footnote, color: colors.secondaryText }}>{arrival.locationMessage}</Text> : null}
          <Text style={{ ...type.footnote, color: colors.secondaryText }}>{arrival.trainId ? `열차 ${arrival.trainId} · ` : ''}{arrival.receivedAt ? `정보 생성 ${new Date(arrival.receivedAt).toLocaleTimeString('ko-KR')}` : '생성 시각 미제공'}</Text>
        </View>;
      })}
      {query.data ? <Text style={{ ...type.footnote, color: colors.tertiaryText }}>{query.data.attribution}</Text> : null}
    </BottomSheetScrollView>
  </MapBottomSheet>;
}
