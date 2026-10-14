import { useAppTheme } from '@/shared/ui/design-system';
import { isAxiosError } from 'axios';
import { memo, useEffect, useMemo } from "react";
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMapTabVisibility } from '@/components/map-tab-visibility';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import { MapBottomSheet } from '@/shared/ui/map-bottom-sheet';

import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import {
  formatEta,
  formatRemainingStops,
  groupBusArrivals,
  type BusArrivalGroup,
} from '@/features/bus-stop/model/bus-arrival';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';

const EMPTY_ARRIVALS: import('../api/get-bus-arrivals').BusArrival[] = [];

type BusStopBottomSheetProps = {
  busStop: BusStop;
  onClose: () => void;
  onHeightChange: (height: number) => void;
  onSelectRoute: (routeId: string, stationSeq: number) => void;
};

/**
 * 선택한 정류장의 노선별 도착 정보를 바텀 시트에 표시한다.
 *
 * 차량별 서버 응답을 노선으로 묶어 첫 번째·두 번째 차량을 보여 준다.
 * 최초 로딩, 요청 실패, 도착 정보 없음은 서로 다른 상태로 안내하고
 * 마지막 갱신 시각과 수동 새로고침도 제공한다.
 * @param props.busStop 표시할 서버 정류장. ID가 도착 정보 조회 키가 된다.
 * @param props.onClose 선택을 해제하고 시트를 닫는 콜백.
 */
export const BusStopBottomSheet = memo(function BusStopBottomSheet({
  busStop,
  onClose,
  onHeightChange,
  onSelectRoute,
}: BusStopBottomSheetProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { setMapTabHidden } = useMapTabVisibility();
  const {
    data: arrivals = EMPTY_ARRIVALS,
    dataUpdatedAt,
    isError,
    error,
    isFetching,
    isPending,
    refetch,
  } = useBusArrivals(busStop.id);
  useEffect(() => {
    if (!isAxiosError(error) || error.response?.status !== 410) return;
    onClose();
    Alert.alert('정차 노선이 없는 정류장', '현재 버스가 정차하지 않는 것으로 확인되어 지도에서 제외했습니다.');
  },[error,onClose]);
  const errorMessage = isAxiosError(error) && typeof error.response?.data?.message==='string' ? error.response.data.message : '도착정보를 불러오지 못했습니다.';
  const arrivalGroups = useMemo(() => groupBusArrivals(arrivals), [arrivals]);
  const soonBusNumbers = useMemo(() => arrivalGroups
    .filter((group) => group.first.etaSeconds !== null && group.first.etaSeconds <= 60)
    .map((group) => group.busNumber), [arrivalGroups]);

  const header=(<View style={{backgroundColor:colors.surface}}>
      <View style={styles.header}>
        <View style={styles.stationText}>
          <Text accessibilityRole="header" style={styles.title}>{busStop.name}</Text>
          <Text style={styles.subtitle}>
            {busStop.arsId ?? '정류장 번호 없음'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="정류장 정보 닫기"
          hitSlop={12}
          onPress={onClose}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
          ]}
        >
          <SymbolView name={{ios:'xmark',android:'close',web:'close'}} size={18} tintColor={colors.secondaryText} />
        </Pressable>
      </View>

      <View style={styles.refreshRow}>
        <Text style={styles.updatedAt}>
          {dataUpdatedAt
            ? `${new Date(dataUpdatedAt).toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })} 갱신`
            : '도착정보 조회 중'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="버스 도착정보 새로고침"
          disabled={isFetching}
          onPress={() => void refetch()}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text style={styles.refreshText}>{isFetching ? '갱신 중' : '새로고침'}</Text>
        </Pressable>
      </View>


      {soonBusNumbers.length>0 ? <View style={styles.soonRow}><Text style={styles.soonBadge}>곧 도착</Text><Text style={styles.soonNumbers}>{soonBusNumbers.join(', ')}</Text></View> : null}
    </View>);
  const empty=(<View style={styles.stateContainer}>
    {isPending ? <ActivityIndicator color={colors.accent} /> : null}
    <Text style={styles.stateText}>{isPending ? '도착정보를 불러오고 있습니다.' : isError ? errorMessage : '현재 도착 예정인 버스가 없습니다.'}</Text>
    {isError ? <Pressable onPress={()=>void refetch()}><Text style={styles.retryText}>다시 시도</Text></Pressable> : null}
  </View>);
  return <MapBottomSheet onHeightChange={onHeightChange}>
    <BottomSheetFlatList<BusArrivalGroup>
      data={arrivalGroups}
      keyExtractor={(group)=>`${group.routeId}:${group.stationSeq ?? ''}`}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      contentContainerStyle={styles.arrivalList}
      showsVerticalScrollIndicator={false}
            renderItem={({item:group}) => (
              <View key={`${group.routeId}:${group.stationSeq ?? ''}`} style={styles.arrivalRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${group.busNumber}번 노선 상세 보기`}
                onPress={() => onSelectRoute(group.routeId, group.first.stationSeq ?? 0)}
                style={styles.routeButton}
              >
                <View style={styles.routeHeader}>
                  <Text style={[styles.routeType, group.routeType.includes('마을') && styles.villageRoute]}>
                    {group.routeType.includes('마을') ? '마을' : '일반'}
                  </Text>
                  <Text style={styles.busNumber}>{group.busNumber}</Text>
                </View>
                <View style={styles.arrivalTimes}>
                  <ArrivalTime arrival={group.first} />
                  {group.second ? (
                    <ArrivalTime arrival={group.second} />
                  ) : null}
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${group.busNumber}번 버스 알림 설정`}
                hitSlop={4}
                style={({pressed}) => [styles.alertButton,pressed && styles.pressed]}
                onPress={() => {
                  setMapTabHidden(false);
                  router.navigate({pathname:'/alerts',params:{
                    stationId:busStop.id,stationName:busStop.name,
                    latitude:String(busStop.latitude),longitude:String(busStop.longitude),
                    routeId:group.routeId,busNumber:group.busNumber,
                    ...(group.stationSeq === undefined ? {} : {stationSeq:String(group.stationSeq)}),
                    requestId:String(Date.now()),alertId:'',
                  }});
                }}>
                <SymbolView name={{ios:'bell',android:'notifications',web:'notifications'}} size={21} tintColor={colors.accent} />
              </Pressable>
              </View>
            )}
    />
  </MapBottomSheet>;
});

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) => StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  stationText: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 5,
    color: colors.secondaryText,
    fontSize: 14,
  },
  closeButton: {
    width: 44,
    height: 44,
    marginLeft: 12,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondarySurface,
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.separator,
  },
  updatedAt: {
    color: colors.tertiaryText,
    fontSize: 12,
  },
  refreshText: {
    color: colors.accent,
    minHeight: 44,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  stateContainer: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  stateText: {
    color: colors.secondaryText,
    fontSize: 14,
  },
  retryText: {
    minHeight: 44,
    paddingVertical: 12,
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  soonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  soonBadge: {
    color: colors.danger,
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontWeight: '600',
  },
  soonNumbers: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
  },
  arrivalList: {
    paddingBottom: 4,
  },
  arrivalRow: {
    minHeight: 66,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  routeButton: { minHeight:44, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertButton: { width: 44, height: 44, marginLeft: 10, borderRadius: 22, backgroundColor: colors.accentSurface, alignItems: 'center', justifyContent: 'center' },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
    flexWrap: 'wrap',
  },
  busNumber: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '600',
  },
  routeType: {
    overflow: 'hidden',
    color: colors.onAccent,
    backgroundColor: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  villageRoute: {
    backgroundColor: colors.success,
  },
  arrivalTimes: {
    alignItems: 'flex-end',
    flexShrink: 1,
    gap: 3,
  },
  etaText: {
    textAlign: 'right',
  },
  eta: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  noEta: {
    color: colors.tertiaryText,
  },
  pressed: {
    opacity: 0.65,
  },
});

/**
 * 노선 카드의 첫 번째·두 번째 차량 ETA를 같은 형식으로 표시한다.
 * @param props.arrival 표시할 차량의 도착 시간과 남은 정류장 수.
 */
function ArrivalTime({
  arrival,
}: {
  arrival: BusArrivalGroup['first'];
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Text style={[styles.eta, styles.etaText, arrival.etaSeconds === null && styles.noEta]}>
      {formatEta(arrival.etaSeconds, arrival.serviceStatus, arrival.etaPrecision, arrival.etaSource)}
      {arrival.remainingStops !== null ? ` (${formatRemainingStops(arrival.remainingStops)})` : ''}
    </Text>
  );
}
