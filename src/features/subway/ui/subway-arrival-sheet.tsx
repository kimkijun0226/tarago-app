/** @fileoverview 선택 역의 도착정보·시간표·시설·노선도와 지도 및 알림 화면으로의 이동을 연결한다. */
import type { SharedValue } from 'react-native-reanimated';
import { SheetToolbar } from '@/shared/ui/sheet-toolbar';

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { isAxiosError } from 'axios';
import { subwayDirectionPresentation, stationLabel } from '../model/subway-direction';
import { router } from 'expo-router';
import { getServiceStatus } from '@/features/subway/model/subway-arrival-display';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import {
  useSubwayFacilities,
  useSubwayStation,
  useSubwayTimetable,
} from '@/features/subway/model/use-subway-station';
import type { SubwayDayType } from '@/features/subway/api/get-subway-station';
import { SubwayDirectionCard } from './subway-direction-card';
import { SubwayStationRail, SubwayNetworkPanel, SubwayNetworkModal } from './subway-network';
import { SubwayTimetableModal } from '@/features/subway/ui/subway-timetable-modal';
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { mapUi } from '@/shared/ui/map-design-tokens';

/** 노선 고유색과 구분되는 공통 강조색·본문·보조 글자색이다. */
const BLUE = mapUi.blue,
  INK = mapUi.text,
  GRAY = mapUi.secondaryText;

/** 주요 지하철 노선의 표시색이다. 목록에 없는 노선은 서버 색 또는 기본 파란색을 사용한다. */
const LINE_COLORS: Record<string, string> = {
  '1호선': '#2D3D98',
  '2호선': '#00A84D',
  '3호선': '#EF7C1C',
  '4호선': '#00A5DE',
  '5호선': '#996CAC',
  '6호선': '#CD7C2F',
  '7호선': '#697512',
  '8호선': '#E6186C',
  '9호선': '#BDB092',
  신분당선: '#D4003B',
  경의중앙선: '#77C4A3',
  수인분당선: '#F5A200',
  공항철도: '#0090D2',
};

/**
 * 실시간 정보와 공식 역 정보를 결합해 선택 역 상세를 표시한다. 정보 부재만으로 운행 상태를 단정하지 않는다.
 * @param props 역·초기 노선·시트 높이 제어 및 지도/경로 선택 콜백.
 * @returns 역 상세 시트와 시간표·노선도 모달. 초 단위 시각에 의존하는 값은 직접 계산하며 측정 없이 메모화를 추가하지 않는다.
 */
export function SubwayArrivalSheet({
  stationName,
  initialLineName,
  onClose,
  onHeightChange,
  animatedPosition,
  snap,
  onChangeSnap,
  onSelectStation,
}: {
  stationName: string;
  initialLineName?: string;
  onClose: () => void;
  onHeightChange: (height: number) => void;
  animatedPosition?: SharedValue<number>;
  snap?: MapSheetSnap;
  onChangeSnap?: (snap: MapSheetSnap) => void;
  onSelectStation?: (
    name: string,
    lineName: string,
    point?: { latitude: number; longitude: number },
  ) => void;
}) {
  /** 선택 역의 15초 주기 실시간 도착 Query다. */
  const query = useSubwayArrivals(stationName);

  /** 실시간 도착정보와 독립적으로 조회하는 공식 역·노선 메타데이터다. */
  const station = useSubwayStation(stationName);

  /** 역 연락처와 공개 엘리베이터 위치의 Query 결과다. */
  const facilities = useSubwayFacilities(stationName);

  /** 초 단위 도착 문구와 영업 상태를 다시 계산할 현재 시각이다. */
  const [now, setNow] = useState(() => Date.now());

  /** 사용자가 선택한 역·노선을 함께 기록해 다른 역의 이전 노선 선택이 적용되지 않게 한다. */
  const [selection, setSelection] = useState({ stationName, initialLineName, lineName: '' });

  /** 실시간 표시와 전체 시간표·첫차/막차 모달 중 현재 모드를 선택한다. */
  const [tab, setTab] = useState<'live' | 'timetable' | 'firstLast'>('live');

  /** 상세 열차 목록을 펼칠 방면 이름이다. 빈 문자열이면 모든 방면의 요약을 표시한다. */
  const [detailDirection, setDetailDirection] = useState('');

  /** 시간표 모달에서 사용자가 고른 영업일 유형이다. null이면 현재 영업일 유형을 따른다. */
  const [chosenDay, setChosenDay] = useState<SubwayDayType | null>(null);

  /** 전체 역 목록 노선도 모달의 표시 여부다. */
  const [showNetwork, setShowNetwork] = useState(false);

  /** 부모가 snap을 제어하지 않을 때 사용할 시트 높이 단계다. */
  const [localSnap, setLocalSnap] = useState<MapSheetSnap>('half');

  /** 부모가 전달한 높이를 우선하고 없으면 시트 내부의 높이를 사용한다. */
  const activeSnap = snap ?? localSnap;

  /**
   * 로컬 시트 높이를 갱신하고 제어 중인 부모에도 전달한다.
   * @param next 다음 시트 펼침 단계.
   */
  const changeSnap = (next: MapSheetSnap) => {
    setLocalSnap(next);
    onChangeSnap?.(next);
  };

  /** 마운트 동안 1초마다 현재 시각을 갱신해 ETA를 재계산한다. 빈 의존성으로 타이머를 하나만 만들고 cleanup에서 해제한다. */
  useEffect(() => {
    /** 도착 카운트다운을 초마다 다시 그리는 interval 핸들이다. 언마운트 때 해제한다. */

    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  /** 현재 역 도착 응답의 열차 목록이다. 응답 전에는 빈 목록으로 표시 계산을 유지한다. */
  const arrivals = query.data?.arrivals ?? [];

  /** 실시간 목록과 공식 역 정보에서 노선을 합쳐 ID 순으로 정렬한 선택 후보 목록이다. */
  const lines = [
    ...new Map([
      ...arrivals.map((arrival) => [arrival.lineName, arrival.lineId] as const),
      ...(station.data?.lines ?? []).map((line) => [line.lineName, line.lineId] as const),
    ]).entries(),
  ].sort((a, b) => Number(a[1]) - Number(b[1]));

  /** 검색에서 전달받은 초기 노선명에서 수도권 접두어를 제거한 이름이다. */
  const initial = initialLineName?.replace(/^수도권/, '') ?? '';
  if (initial && !lines.some(([name]) => name === initial)) lines.unshift([initial, '']);

  /** 현재 역에 유효한 사용자 선택을 우선하고 초기 노선·첫 노선 순으로 보완한 표시 노선이다. */
  const lineName =
    selection.stationName === stationName &&
    selection.initialLineName === initialLineName &&
    lines.some(([name]) => name === selection.lineName)
      ? selection.lineName
      : initial || lines[0]?.[0] || '';

  /** 선택한 노선명에 해당하는 공식 역간·종착역 정보다. */
  const line = station.data?.lines.find((item) => item.lineName === lineName);

  /** 정해진 노선색, 서버 색, 기본색 순으로 선택한 현재 노선 표시색이다. */
  const color = LINE_COLORS[lineName] ?? line?.color ?? BLUE;

  /** 전체 도착 열차 중 현재 선택한 노선의 열차만 남긴 목록이다. */
  const lineArrivals = arrivals.filter((arrival) => arrival.lineName === lineName);

  // 03시 이전에는 전날 영업일의 24시 이후 열차를 기준으로 첫차·막차를 비교한다.
  /** 한국 시간 새벽 3시를 경계로 계산한 영업일의 요일이다. */
  const serviceDay = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(now - 3 * 3_600_000);

  /** 영업일의 토요일·일요일 여부로 선택한 기본 시간표 유형이다. 별도 공휴일 판정은 하지 않는다. */
  const serviceDayType: SubwayDayType =
    serviceDay === 'Sat' ? 'saturday' : serviceDay === 'Sun' ? 'holiday' : 'weekday';

  /** 사용자가 고른 요일 유형을 우선하고 없으면 현재 영업일 유형을 사용한다. */
  const dayType = chosenDay ?? serviceDayType;

  /** 운행 상태 판정에 사용할 현재 영업일의 공식 시간표 Query다. 모달에서 고른 날짜와 구분한다. */
  const timetable = useSubwayTimetable(
    stationName,
    line?.lineId ?? lines.find(([name]) => name === lineName)?.[1] ?? '',
    serviceDayType,
  );

  /** 현재 노선 실시간 열차에 등장한 방면 이름을 중복 제거한 목록이다. */
  const liveDirections = [...new Set(lineArrivals.map((arrival) => arrival.direction))];

  /** 공식 시간표에 정의된 방면 이름과 순서다. */
  const scheduledDirections = (timetable.data?.directions ?? []).map((item) => item.direction);

  /** 모든 실시간 방면이 시간표 방면에도 있어 같은 이름으로 결합할 수 있는지 확인한다. */
  const sameDirectionNames = liveDirections.every((direction) =>
    scheduledDirections.includes(direction),
  );

  /** 서로 일치하는 공식 방면을 우선하고 아니면 실시간 방면을 사용한 표시 대상 목록이다. */
  const directions =
    scheduledDirections.length && sameDirectionNames
      ? scheduledDirections
      : liveDirections.length
        ? liveDirections
        : scheduledDirections;

  /** 유효한 방면 상세 선택이 있으면 해당 방면 하나만 남긴 화면 목록이다. */
  const displayedDirections =
    detailDirection && directions.includes(detailDirection) ? [detailDirection] : directions;

  /** 서버 목록을 가져온 시각부터 경과한 초다. 남은 ETA에서 차감한다. */
  const elapsed = query.data
    ? Math.max(0, Math.floor((now - Date.parse(query.data.fetchedAt)) / 1000))
    : 0;

  /** 도착 조회의 서버 오류 문구를 문자열일 때 우선 사용한 화면 안내다. */
  const errorMessage =
    isAxiosError(query.error) && typeof query.error.response?.data?.message === 'string'
      ? query.error.response.data.message
      : '도착 정보를 불러오지 못했습니다.';

  /** 이미 역으로 끝나는 이름에 역 접미어가 중복되지 않도록 만든 제목이다. */
  const title = stationName.endsWith('역') ? stationName : `${stationName}역`;

  /**
   * 실시간 방면과 공식 인접역을 대조해 다음 역 기준으로 표시한다.
   * @param direction 서버 방면 이름.
   */
  const directionLabel = (direction: string) => {
    const info = subwayDirectionPresentation(line, direction, arrivals, timetable.data?.directions);
    return info.nextStationName ? `${stationLabel(info.nextStationName)} 방면` : '다음 역 확인 중';
  };

  /**
   * 선택 노선이 바뀌면 방면 상세를 닫고 지도 선택도 갱신한다.
   * @param name 노선 이름.
   */
  const setLine = (name: string) => {
    setSelection({ stationName, initialLineName, lineName: name });
    setDetailDirection('');
    onSelectStation?.(stationName, name);
  };

  /** 공식 역 메타데이터를 우선해 복원한 선택 노선의 서버 ID다. */
  const selectedLineId = line?.lineId ?? lines.find(([name]) => name === lineName)?.[1] ?? '';

  /**
   * 실제 조회 중인 역·노선·방향을 새 예약 초안으로 전달한다.
   * @param direction 알림을 설정할 방면.
   */
  const openAlert = (direction: string) =>
    router.push({
      pathname: '/subway-alerts',
      params: {
        alertKind: 'time',
        alertId: '',
        sourceAlertId: '',
        sourceAlertIds: '',
        stationName,
        lineId: selectedLineId,
        lineName,
        direction,
        nextStationName:
          subwayDirectionPresentation(line, direction, arrivals, timetable.data?.directions)
            .nextStationName ?? '',
        destinationNames: JSON.stringify(
          subwayDirectionPresentation(line, direction, arrivals, timetable.data?.directions)
            .destinationNames,
        ),
        requestId: String(now),
      },
    });

  /** 서버 수집 시각을 한국어 24시간 시·분으로 표시한 갱신 문구다. */
  const updatedAt = new Date(query.data?.fetchedAt ?? now).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  /** 현재 시각을 한국 시간의 시·분 숫자로 분리한 결과다. */
  const kst = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(now)
    .split(':')
    .map(Number);

  /** 새벽 3시 이전은 1440분을 더해 전날 영업일에 속하도록 맞춘 현재 분이다. */
  const currentServiceMinute = kst[0] * 60 + kst[1] + (kst[0] < 3 ? 1440 : 0);

  const toolbar = (
    <SheetToolbar
      onClose={onClose}
      closeLabel="지하철역 닫기"
      header={
        <View style={[s.header, activeSnap === 'full' && { paddingTop: 0 }]}>
          <View style={s.titleRow}>
            <Text accessibilityRole="header" style={s.title}>
              {title} <Text style={{ color }}>{lineName}</Text>
            </Text>
          </View>
          <Text style={s.subtitle}>수도권 지하철</Text>
        </View>
      }
    />
  );

  return (
    <>
      <MapBottomSheet
        toolbar={toolbar}
        edgeToEdge={false}
        onHeightChange={onHeightChange}
        animatedPosition={animatedPosition}
        snap={activeSnap}
        onChangeSnap={changeSnap}
      >
        <View style={s.sheetContent}>
          <BottomSheetScrollView contentContainerStyle={s.content}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.actions}
            >
              <Pressable
                onPress={() => {
                  setTab('timetable');
                  changeSnap('full');
                }}
                accessibilityRole="button"
                style={({ pressed }) => [s.action, pressed && s.pressed]}
              >
                <SymbolView
                  name={{ ios: 'calendar', android: 'calendar_month' }}
                  size={18}
                  tintColor="#333"
                />
                <Text style={s.actionText}>전체 시간표</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTab('firstLast');
                  changeSnap('full');
                }}
                accessibilityRole="button"
                style={({ pressed }) => [s.action, pressed && s.pressed]}
              >
                <SymbolView name={{ ios: 'tram', android: 'train' }} size={18} tintColor="#333" />
                <Text style={s.actionText}>첫차·막차</Text>
              </Pressable>
            </ScrollView>
            <View style={s.rule} />
            <View style={s.arrivalSection}>
              <SubwayStationRail
                stationName={stationName}
                lineName={lineName}
                line={line}
                color={color}
                onSelectStation={onSelectStation}
              />
              <View style={s.liveToolbar}>
                <View style={s.segment}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: tab === 'live' }}
                    onPress={() => setTab('live')}
                    style={({ pressed }) => [
                      s.segmentButton,
                      tab === 'live' && s.liveSelected,
                      pressed && s.pressed,
                    ]}
                  >
                    <Text style={[s.segmentText, { color: tab === 'live' ? BLUE : GRAY }]}>
                      실시간
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: tab !== 'live' }}
                    onPress={() => setTab('timetable')}
                    style={({ pressed }) => [
                      s.segmentButton,
                      tab !== 'live' && s.scheduleSelected,
                      pressed && s.pressed,
                    ]}
                  >
                    <Text style={[s.segmentText, { color: tab !== 'live' ? BLUE : GRAY }]}>
                      시간표
                    </Text>
                  </Pressable>
                </View>
                <View style={s.refreshRow}>
                  <Text style={s.clock}>{updatedAt}</Text>
                  <Pressable
                    onPress={() => void query.refetch()}
                    disabled={query.isFetching}
                    accessibilityRole="button"
                    accessibilityLabel="도착정보 새로고침"
                    style={({ pressed }) => [s.refresh, pressed && s.pressed]}
                  >
                    {query.isFetching ? (
                      <ActivityIndicator size="small" color={GRAY} />
                    ) : (
                      <Text style={s.refreshIcon}>↻</Text>
                    )}
                  </Pressable>
                </View>
              </View>
              <>
                {query.isError ? <Text style={s.error}>{errorMessage}</Text> : null}
                {query.isPending ? <ActivityIndicator color={BLUE} /> : null}
                {detailDirection ? (
                  <Pressable onPress={() => setDetailDirection('')} accessibilityRole="button">
                    <Text style={s.link}>‹ 전체 방면</Text>
                  </Pressable>
                ) : null}
                <View style={s.directionCards}>
                  {displayedDirections.map((direction) => (
                    <SubwayDirectionCard
                      key={direction}
                      arrivals={lineArrivals.filter((arrival) => arrival.direction === direction)}
                      label={directionLabel(direction)}
                      status={getServiceStatus(
                        direction,
                        timetable.data?.directions ?? [],
                        currentServiceMinute,
                      )}
                      now={now}
                      elapsed={elapsed}
                      detailed={Boolean(detailDirection)}
                      onDetail={() => setDetailDirection(direction)}
                      onAlert={selectedLineId ? () => openAlert(direction) : undefined}
                    />
                  ))}
                  {!query.isPending && !directions.length ? (
                    <View style={s.emptyCard}>
                      <Text style={s.unavailable}>현재 제공되는 실시간 도착정보가 없습니다.</Text>
                    </View>
                  ) : null}
                </View>
              </>
              <View style={s.transferRow}>
                <Text style={s.transferTitle}>환승역</Text>
                {lines.map(([name]) => (
                  <Pressable
                    key={name}
                    onPress={() => setLine(name)}
                    accessibilityRole="button"
                    accessibilityLabel={`${name} 선택`}
                    accessibilityState={{ selected: name === lineName }}
                    style={({ pressed }) => [
                      s.badge,
                      { backgroundColor: LINE_COLORS[name] ?? BLUE },
                      name === lineName && s.selectedBadge,
                      pressed && s.pressed,
                    ]}
                  >
                    <Text style={s.badgeText}>{name.replace('호선', '')}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={s.sectionDivider} />
            <SubwayNetworkPanel
              line={line}
              lineName={lineName}
              color={color}
              pending={station.isPending}
              onOpen={() => setShowNetwork(true)}
              onSelectStation={onSelectStation}
            />
            <View style={s.sectionDivider} />
            <View style={s.infoSection}>
              <Text style={s.sectionTitle}>역정보</Text>
              {facilities.data?.contacts
                .filter((item) => item.lineName === lineName)
                .map((item) => (
                  <View key={`${item.lineName}:${item.phone}`} style={{ gap: 7, marginTop: 16 }}>
                    <Text style={s.unavailable}>{item.address}</Text>
                    <Text style={s.unavailable}>{item.phone}</Text>
                  </View>
                ))}
              <View style={s.infoRule} />
              <Text style={s.facilityTitle}>시설정보</Text>
              {facilities.isPending ? (
                <ActivityIndicator color={BLUE} />
              ) : facilities.isError ? (
                <View style={{ gap: 8 }}>
                  <Text style={s.error}>시설정보를 불러오지 못했습니다.</Text>
                  <Pressable onPress={() => void facilities.refetch()} accessibilityRole="button">
                    <Text style={s.link}>다시 조회</Text>
                  </Pressable>
                </View>
              ) : facilities.data?.elevators.length ? (
                <View style={{ gap: 10 }}>
                  <Text style={s.unavailable}>
                    엘리베이터 위치 {facilities.data.elevators.length}개 지점 ·{' '}
                    {facilities.data.elevatorSourceYear}년 기준
                  </Text>
                  <Text style={s.unavailable}>
                    공식 위치 자료이며 현재 운행 여부는 제공되지 않습니다.
                  </Text>
                  {onSelectStation ? (
                    <Pressable
                      onPress={() =>
                        onSelectStation(stationName, lineName, facilities.data!.elevators[0])
                      }
                      accessibilityRole="button"
                    >
                      <Text style={s.link}>첫 번째 엘리베이터 지점 지도 보기</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Text style={s.unavailable}>공개된 시설정보가 없습니다.</Text>
              )}
              {facilities.data ? (
                <Text style={s.attribution}>{facilities.data.attribution}</Text>
              ) : query.data ? (
                <Text style={s.attribution}>{query.data.attribution}</Text>
              ) : null}
            </View>
          </BottomSheetScrollView>
        </View>
      </MapBottomSheet>
      <SubwayTimetableModal
        stationName={stationName}
        lineId={selectedLineId}
        lineName={lineName}
        dayType={dayType}
        mode={tab}
        onClose={() => setTab('live')}
        onDayChange={setChosenDay}
      />
      <SubwayNetworkModal
        visible={showNetwork}
        line={line}
        lineName={lineName}
        color={color}
        onClose={() => setShowNetwork(false)}
        onSelectStation={onSelectStation}
      />
    </>
  );
}

/** 이 파일의 지하철 표시 요소가 사용하는 고정 스타일을 모듈 범위에서 한 번 만든다. */
const s = StyleSheet.create({
  content: { paddingBottom: 32, backgroundColor: 'white' },
  header: { paddingVertical: 8 },
  sheetContent: { flex: 1 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  selectedBadge: { borderWidth: 3, borderColor: mapUi.blueSurface },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 25, fontWeight: '700', color: INK, flex: 1, letterSpacing: -0.8 },
  subtitle: { fontSize: 14, color: GRAY, marginTop: 4 },
  actions: { paddingHorizontal: 16, gap: 5, paddingVertical: 20 },
  action: {
    height: 44,
    paddingHorizontal: 13,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: mapUi.border,
    backgroundColor: mapUi.separator,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  actionText: { fontSize: 16, fontWeight: '500', color: INK },
  rule: { height: 1, backgroundColor: '#F0F0F0' },
  arrivalSection: { paddingHorizontal: 18, paddingTop: 24 },
  badge: {
    minWidth: 44,
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 14, color: 'white', fontWeight: '500' },
  liveToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  segment: { flexDirection: 'row', padding: 4, backgroundColor: mapUi.separator, borderRadius: 24 },
  segmentButton: {
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 20,
  },
  liveSelected: { borderColor: mapUi.blueSurface, backgroundColor: mapUi.blueSurface },
  scheduleSelected: { borderColor: mapUi.blueSurface, backgroundColor: mapUi.blueSurface },
  segmentText: { fontSize: 14, fontWeight: '600' },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  clock: { color: GRAY, fontSize: 13 },
  refresh: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: mapUi.separator,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: { color: GRAY, fontSize: 22, lineHeight: 25 },
  directionCards: { flexDirection: 'row', alignItems: 'stretch', gap: 9 },
  transferRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    marginBottom: 20,
  },
  transferTitle: { fontSize: 15, fontWeight: '700', color: INK },
  sectionDivider: { height: 8, backgroundColor: mapUi.separator },
  infoSection: { paddingHorizontal: 18, paddingVertical: 20 },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: INK },
  infoRule: { height: 1, backgroundColor: '#EEE', marginHorizontal: -18, marginVertical: 16 },
  facilityTitle: { fontSize: 17, fontWeight: '600', color: '#555', marginBottom: 12 },
  unavailable: { fontSize: 14, lineHeight: 21, color: GRAY },
  emptyCard: {
    minHeight: 108,
    flex: 1,
    borderWidth: 1,
    borderColor: '#E1E1E1',
    borderRadius: 20,
    backgroundColor: mapUi.separator,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  error: { fontSize: 13, color: '#D83F35', marginVertical: 8 },
  link: { fontSize: 14, color: BLUE },
  attribution: { marginTop: 20, color: GRAY, fontSize: 11 },
});
