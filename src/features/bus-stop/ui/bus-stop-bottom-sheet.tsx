/** @fileoverview 선택 정류장의 도착 목록·새로고침·노선 및 알림 진입 UI를 구성한다. 서버 상태는 Query 훅이 소유한다. */
import type { SharedValue } from 'react-native-reanimated';

import type { BusArrival } from '../api/get-bus-arrivals';
import { useAppStore } from '@/shared/model/app-store';
import type { Point } from '@/shared/types/geo';
import { useAppTheme } from '@/shared/ui';
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { isAxiosError } from 'axios';
import { router } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArrivalRefreshButton } from './arrival-refresh-button';

import type { BusStop } from '@/features/bus-stop/api/get-nearby-bus-stops';
import { groupBusArrivals, type BusArrivalGroup } from '@/features/bus-stop/model/bus-arrival';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { BusArrivalRow } from './bus-arrival-row';
import { SoonBusArrivals } from './soon-bus-arrivals';
import { BusStopSheetHeader } from './bus-stop-sheet-header';

/** 응답 전에도 같은 빈 배열 참조를 사용해 파생 계산을 불필요하게 반복하지 않는다. */
const EMPTY_ARRIVALS: import('../api/get-bus-arrivals').BusArrival[] = [];

type BusStopBottomSheetProps = {
  busStop: BusStop;
  position: Point | null;
  onClose: () => void;
  onChangeSnap?: (snap: MapSheetSnap) => void;
  onHeightChange: (height: number) => void;
  animatedPosition?: SharedValue<number>;
  onSelectRoute: (routeId: string, stationSeq: number, source?: BusArrival['routeSource']) => void;
};

/**
 * 선택한 정류장의 노선별 도착 정보를 바텀 시트에 표시한다.
 *
 * 차량별 서버 응답을 노선으로 묶어 첫 번째·두 번째 차량을 보여 준다.
 * 최초 로딩, 요청 실패, 도착 정보 없음은 서로 다른 상태로 안내하고
 * 마지막 갱신 시각과 수동 새로고침도 제공한다.
 * memo는 지도 화면 갱신 시 정류장과 콜백이 같으면 시트 렌더링을 생략한다.
 * @param props.busStop 표시할 서버 정류장. ID가 도착 정보 조회 키가 된다.
 * @param props.onClose 선택을 해제하고 시트를 닫는 콜백.
 * @param props.onHeightChange 지도 가림 영역에 반영할 실제 시트 높이 콜백.
 * @param props.onSelectRoute 경유 순번을 포함해 노선 상세를 여는 콜백.
 * @returns 조회 상태와 노선별 도착 시간을 표시하는 바텀 시트.
 */
export const BusStopBottomSheet = memo(function BusStopBottomSheet({
  busStop,
  position,
  onClose,
  onHeightChange,
  animatedPosition,
  onSelectRoute,
  onChangeSnap,
}: BusStopBottomSheetProps) {
  /** 시트의 정착 높이다. 제스처 중간 프레임은 네이티브에서 처리한다. */
  const [snap, setSnap] = useState<MapSheetSnap>('half');

  /** 현재 시트 높이를 부모 배경과 동기화한다. 개발 중 새로고침에서도 전체 화면과 검색창 상태가 어긋나지 않게 한다. */
  useEffect(() => {
    onChangeSnap?.(snap);
  }, [onChangeSnap, snap]);

  /** 정착 높이만 부모에 공유해 검색창과 상태 표시줄 배경을 함께 전환한다. */
  const changeSnap = useCallback(
    (next: MapSheetSnap) => {
      setSnap(next);
      onChangeSnap?.(next);
    },
    [onChangeSnap],
  );

  /** API 거리는 지도 타일 중심 기준이다. 화면의 거리는 이용자의 실제 현재 위치에서 계산한다. */
  const distanceMeters = position
    ? Math.hypot(
        (busStop.latitude - position.latitude) * 111_320,
        (busStop.longitude - position.longitude) *
          111_320 *
          Math.cos((position.latitude * Math.PI) / 180),
      )
    : null;

  /** 현재 테마 팔레트이며 테마 전환 시 텍스트·표면·강조 색상에 반영한다. */
  const { colors } = useAppTheme();

  /** 현재 테마의 스타일 계산 결과이며 팔레트가 바뀔 때만 다시 만든다. */
  const styles = useMemo(() => createStyles(colors), [colors]);

  /** 알림 화면으로 이동할 때 지도 탭을 다시 표시하기 위한 공유 UI 상태 변경 함수다. */
  const setMapTabHidden = useAppStore((state) => state.setMapTabHidden);

  /** 도착 목록과 갱신 시각·오류·요청 상태를 읽어 시트 안내 및 새로고침에 사용한다. */
  const {
    data: arrivals = EMPTY_ARRIVALS,
    dataUpdatedAt,
    isError,
    error,
    isFetching,
    isPending,
    refetch,
  } = useBusArrivals(busStop.id, snap !== 'compact');

  /**
   * 공식 조회가 410으로 정차 노선 부재를 확인하면 시트를 닫고 이용자에게 알린다.
   * error 또는 onClose가 바뀔 때 최신 오류와 닫기 동작으로 판단한다.
   * 구독이나 지연 작업을 만들지 않으므로 별도 정리 함수는 없다.
   */
  useEffect(() => {
    if (!isAxiosError(error) || error.response?.status !== 410) return;
    onClose();
    Alert.alert(
      '정차 노선이 없는 정류장',
      '현재 버스가 정차하지 않는 것으로 확인되어 지도에서 제외했습니다.',
    );
  }, [error, onClose]);

  /** 서버가 보낸 사용자용 오류 문구를 우선하며 없으면 기본 조회 실패 문구를 쓴다. */
  const errorMessage =
    isAxiosError(error) && typeof error.response?.data?.message === 'string'
      ? error.response.data.message
      : '도착정보를 불러오지 못했습니다.';

  /** 응답 배열이 바뀔 때만 다시 묶는 노선·경유 순번별 최대 두 차량 목록이다. */
  const arrivalGroups = useMemo(() => groupBusArrivals(arrivals), [arrivals]);

  /** 첫 차량이 60초 안에 도착하는 노선 그룹이며 그룹 변경 시에만 다시 계산한다. */
  const soonGroups = useMemo(
    () =>
      arrivalGroups.filter(
        (group) => group.first.etaSeconds !== null && group.first.etaSeconds <= 60,
      ),
    [arrivalGroups],
  );

  /**
   * 알림 경로에 필요한 정류장·노선 정보를 조합한다. memo 행에 전달하므로 참조를 유지한다.
   * busStop 또는 지도 탭 변경 함수가 바뀌면 최신 정류장으로 동작하도록 콜백을 교체한다.
   */
  const configureAlert = useCallback(
    (group: BusArrivalGroup, kind: 'time' | 'location') => {
      setMapTabHidden(false);
      router.navigate({
        pathname: '/alerts',
        params: {
          alertTransport: 'bus',
          returnTo: 'map',
          alertKind: kind,
          sourceAlertId: '',
          sourceAlertIds: '',
          monitoringId: '',
          stationId: busStop.id,
          stationName: busStop.name,
          latitude: String(busStop.latitude),
          longitude: String(busStop.longitude),
          routeId: group.routeId,
          busNumber: group.busNumber,
          ...(group.stationSeq === undefined ? {} : { stationSeq: String(group.stationSeq) }),
          requestId: String(Date.now()),
          alertId: '',
        },
      });
    },
    [busStop, setMapTabHidden],
  );

  /** 현재 로딩·오류·빈 응답 또는 축소 상태를 안내하는 목록 대체 요소다. */
  const empty = (
    <View style={styles.stateContainer}>
      {isPending ? <ActivityIndicator color={colors.accent} /> : null}
      <Text style={styles.stateText}>
        {isPending
          ? '도착정보를 불러오고 있습니다.'
          : isError
            ? errorMessage
            : '현재 도착 예정인 버스가 없습니다.'}
      </Text>
      {isError ? (
        <Pressable onPress={() => void refetch()}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <>
      <MapBottomSheet
        edgeToEdge={false}
        snap={snap}
        onChangeSnap={changeSnap}
        onHeightChange={onHeightChange}
        animatedPosition={animatedPosition}
        toolbar={
          <View
            style={snap !== 'compact' && soonGroups.length === 0 ? styles.headerDivider : undefined}
          >
            <BusStopSheetHeader
              busStop={busStop}
              distanceMeters={distanceMeters}
              onExpand={() => changeSnap('full')}
              onClose={onClose}
            />
          </View>
        }
      >
        {/* 캐시된 목록은 유지하고 공통 시트의 높이·클리핑으로만 가려 드래그 중 바로 드러나게 한다. */}
        <View style={styles.sheetContent}>
          <SoonBusArrivals groups={soonGroups} onSelectRoute={onSelectRoute} />
          {isError && arrivalGroups.length > 0 ? (
            <Text accessibilityRole="alert" style={styles.retryText}>
              {errorMessage}
            </Text>
          ) : null}
          <FlatList<BusArrivalGroup>
            style={styles.list}
            data={arrivalGroups}
            keyExtractor={(group) => `${group.routeId}:${group.stationSeq ?? ''}`}
            ListEmptyComponent={empty}
            ListFooterComponent={
              <Text
                style={{
                  color: colors.secondaryText,
                  fontSize: 11,
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                }}
              >
                {
                  '실시간 정보는 상황에 따라 오차가 발생할 수 있습니다.\n버스정보 제공: 서울특별시 · 경기도 · 국토교통부(TAGO)'
                }
              </Text>
            }
            contentContainerStyle={styles.arrivalList}
            showsVerticalScrollIndicator={true}
            renderItem={({ item: group }) => (
              <BusArrivalRow
                group={group}
                onSelectRoute={onSelectRoute}
                onConfigureAlert={configureAlert}
              />
            )}
          />
        </View>
      </MapBottomSheet>
      {snap !== 'compact' ? (
        <ArrivalRefreshButton
          updatedAt={dataUpdatedAt}
          fetching={isFetching}
          onRefresh={() => void refetch()}
        />
      ) : null}
    </>
  );
});

/** 정류장 시트의 헤더와 조회 상태에 필요한 테마 스타일을 만든다. */
const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    sheetContent: { flex: 1 },
    headerDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    list: { flex: 1 },
    stateContainer: {
      margin: 16,
      borderRadius: 20,
      backgroundColor: colors.background,
      padding: 20,
      minHeight: 140,
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
    arrivalList: {
      paddingBottom: 110,
    },
    pressed: {
      opacity: 0.65,
    },
  });
