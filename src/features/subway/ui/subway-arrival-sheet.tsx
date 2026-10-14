import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { isAxiosError } from 'axios';
import { router } from 'expo-router';
import type { SubwayArrival } from '@/features/subway/api/get-subway-arrivals';
import { useSubwayArrivals } from '@/features/subway/model/use-subway-arrivals';
import { useSavedSubwayStation } from '@/features/subway/model/use-saved-subway-station';
import { useSubwayFacilities, useSubwayStation, useSubwayTimetable } from '@/features/subway/model/use-subway-station';
import type { SubwayDayType } from '@/features/subway/api/get-subway-station';
import { SubwayTimetableModal } from '@/features/subway/ui/subway-timetable-modal';
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { mapUi } from '@/shared/ui/map-design-tokens';

const BLUE = mapUi.blue, GREEN = mapUi.green, INK = mapUi.text, GRAY = '#919191';
const LINE_COLORS: Record<string, string> = { '1호선': '#2D3D98', '2호선': '#00A84D', '3호선': '#EF7C1C', '4호선': '#00A5DE', '5호선': '#996CAC', '6호선': '#CD7C2F', '7호선': '#697512', '8호선': '#E6186C', '9호선': '#BDB092', 신분당선: '#D4003B', 경의중앙선: '#77C4A3', 수인분당선: '#F5A200', 공항철도: '#0090D2' };

/** 선택 역의 상세는 실제 도착정보·역 메타데이터를 구분하고 데이터가 없는 운행 상태를 단정하지 않는다. */
export function SubwayArrivalSheet({ stationName, initialLineName, onClose, onHeightChange, snap, onChangeSnap, onStart, onEnd, onSelectStation }: {
  stationName: string; initialLineName?: string; onClose: () => void; onHeightChange: (height: number) => void;
  snap?: MapSheetSnap; onChangeSnap?: (snap: MapSheetSnap) => void;
  onStart?: () => void; onEnd?: () => void;
  onSelectStation?: (name: string, lineName: string, point?: { latitude: number; longitude: number }) => void;
}) {
  const query = useSubwayArrivals(stationName);
  const station = useSubwayStation(stationName);
  const facilities = useSubwayFacilities(stationName);
  const [now, setNow] = useState(() => Date.now());
  const [selection, setSelection] = useState({ stationName, lineName: '' });
  const [tab, setTab] = useState<'live' | 'timetable' | 'firstLast'>('live');
  const [detailDirection, setDetailDirection] = useState('');
  const [chosenDay, setChosenDay] = useState<SubwayDayType | null>(null);
  const [showNetwork, setShowNetwork] = useState(false);
  const [localSnap, setLocalSnap] = useState<MapSheetSnap>('half');
  const activeSnap = snap ?? localSnap;
  const changeSnap = (next: MapSheetSnap) => { setLocalSnap(next); onChangeSnap?.(next); };
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const arrivals = query.data?.arrivals ?? [];
  const lines = [...new Map([...arrivals.map(arrival => [arrival.lineName, arrival.lineId] as const),
    ...(station.data?.lines ?? []).map(line => [line.lineName, line.lineId] as const)]).entries()].sort((a, b) => Number(a[1]) - Number(b[1]));
  const initial = initialLineName?.replace(/^수도권/, '') ?? '';
  if (initial && !lines.some(([name]) => name === initial)) lines.unshift([initial, '']);
  const lineName = selection.stationName === stationName && lines.some(([name]) => name === selection.lineName)
    ? selection.lineName : initial || lines[0]?.[0] || '';
  const line = station.data?.lines.find(item => item.lineName === lineName);
  const color = LINE_COLORS[lineName] ?? line?.color ?? BLUE;
  const lineBadge = lineName.replace('호선', '');
  const lineArrivals = arrivals.filter(arrival => arrival.lineName === lineName);
  // 03시 이전에는 전날 영업일의 24시 이후 열차를 기준으로 첫차·막차를 비교한다.
  const serviceDay = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now - 3 * 3_600_000);
  const serviceDayType: SubwayDayType = serviceDay === 'Sat' ? 'saturday' : serviceDay === 'Sun' ? 'holiday' : 'weekday';
  const dayType = chosenDay ?? serviceDayType;
  const timetable = useSubwayTimetable(stationName, line?.lineId ?? lines.find(([name]) => name === lineName)?.[1] ?? '', serviceDayType);
  const liveDirections = [...new Set(lineArrivals.map(arrival => arrival.direction))];
  const scheduledDirections = (timetable.data?.directions ?? []).map(item => item.direction);
  const sameDirectionNames = liveDirections.every(direction => scheduledDirections.includes(direction));
  const directions = scheduledDirections.length && sameDirectionNames ? scheduledDirections : liveDirections.length ? liveDirections : scheduledDirections;
  const displayedDirections = detailDirection && directions.includes(detailDirection) ? [detailDirection] : directions;
  const elapsed = query.data ? Math.max(0, Math.floor((now - Date.parse(query.data.fetchedAt)) / 1000)) : 0;
  const favorite = useSavedSubwayStation(stationName, lineName);
  const errorMessage = isAxiosError(query.error) && typeof query.error.response?.data?.message === 'string'
    ? query.error.response.data.message : '도착 정보를 불러오지 못했습니다.';
  const title = stationName.endsWith('역') ? stationName : `${stationName}역`;
  const directionLabel = (direction: string) => {
    const raw = lineArrivals.find(arrival => arrival.direction === direction)?.destinationDirection;
    const terminal = line?.terminals[direction === '상행' ? 0 : direction === '하행' ? 1 : -1];
    return terminal ? `${terminal} 방면` : raw?.split(' - ').slice(1).join(' - ').replace(/방면$/, ' 방면') || direction;
  };
  const setLine = (name: string) => { setSelection({ stationName, lineName: name }); setDetailDirection(''); onSelectStation?.(stationName, name); };
  const selectedLineId = line?.lineId ?? lines.find(([name]) => name === lineName)?.[1] ?? '';
  const openAlert = (direction: string) => router.push({ pathname: '/subway-alerts', params: {
    stationName, lineId: selectedLineId, lineName, direction, requestId: String(now),
  } });
  const arrivalTime = (arrival: SubwayArrival) => {
    const receipt = arrival.receivedAt ? Date.parse(arrival.receivedAt) : NaN;
    if (!Number.isFinite(receipt) || now - receipt > 120_000) return { text: '갱신 지연', stale: true };
    const seconds = arrival.etaSeconds === null ? null : Math.max(0, arrival.etaSeconds - elapsed);
    return { text: seconds !== null && Number.isFinite(seconds) && seconds > 0
      ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : arrival.arrivalMessage || '시간 확인 중', stale: false };
  };
  const updatedAt = new Date(query.data?.fetchedAt ?? now).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const kst = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).split(':').map(Number);
  const currentServiceMinute = kst[0] * 60 + kst[1] + (kst[0] < 3 ? 1440 : 0);
  const scheduleMinute = (time: string) => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute + (hour < 3 ? 1440 : 0); };
  const serviceStatus = (direction: string) => {
    const scheduled = timetable.data?.directions.find(item => item.direction === direction);
    if (scheduled?.lastTrain && currentServiceMinute > scheduleMinute(scheduled.lastTrain.departureTime)) return '운행종료';
    if (scheduled?.firstTrain && currentServiceMinute < scheduleMinute(scheduled.firstTrain.departureTime)) return '운행 전';
    return '도착정보 없음';
  };
  const controls = <><Pressable accessibilityRole="button" accessibilityLabel={favorite.saved ? '저장한 역에서 제거' : '역 저장'} accessibilityState={{ selected: favorite.saved, disabled: favorite.busy }} disabled={favorite.busy} onPress={() => void favorite.toggle()} style={activeSnap === 'full' ? s.toolbarControl : s.round}><SymbolView name={{ ios: favorite.saved ? 'star.fill' : 'star', android: 'star', web: 'star' }} size={25} tintColor={favorite.saved ? BLUE : INK} /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="지하철역 닫기" onPress={onClose} style={activeSnap === 'full' ? s.toolbarControl : s.round}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={24} tintColor="#444" /></Pressable></>;
  return <><MapBottomSheet edgeToEdge onHeightChange={onHeightChange} snap={activeSnap} onChangeSnap={changeSnap}>
    <BottomSheetScrollView contentContainerStyle={s.content}>
      <View style={[s.header, activeSnap === 'full' && { paddingTop: 0 }]}>
        {activeSnap === 'full' ? <View style={s.fullToolbar}><Pressable onPress={() => changeSnap('half')} accessibilityRole="button" accessibilityLabel="지도와 함께 보기" style={s.toolbarControl}><SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={24} tintColor={INK} /></Pressable><View style={{ flex: 1 }} />{controls}</View> : null}
        <View style={s.titleRow}><Text accessibilityRole="header" style={s.title}>{title} <Text style={{ color }}>{lineName}</Text></Text>
          {activeSnap !== 'full' ? controls : null}
        </View>
        <Text style={s.subtitle}>수도권 지하철</Text>
        {favorite.error ? <Text style={s.error}>{favorite.error}</Text> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.actions}>
        {onStart ? <Pressable onPress={onStart} accessibilityRole="button" style={[s.action, s.departure]}><Text style={[s.actionText, { color: BLUE }]}>출발</Text></Pressable> : null}
        {onEnd ? <Pressable onPress={onEnd} accessibilityRole="button" style={[s.action, s.destination]}><Text style={[s.actionText, { color: 'white' }]}>도착</Text></Pressable> : null}
        <Pressable onPress={() => { setTab('timetable'); changeSnap('full'); }} accessibilityRole="button" style={s.action}><SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} size={18} tintColor="#333" /><Text style={s.actionText}>전체 시간표</Text></Pressable>
        <Pressable onPress={() => { setTab('firstLast'); changeSnap('full'); }} accessibilityRole="button" style={s.action}><SymbolView name={{ ios: 'tram', android: 'train', web: 'train' }} size={18} tintColor="#333" /><Text style={s.actionText}>첫차·막차</Text></Pressable>
      </ScrollView>
      <View style={s.rule} />
      <View style={s.arrivalSection}>
        <View style={[s.rail, { backgroundColor: color }]}>
          {line?.previousStation && onSelectStation ? <Pressable onPress={() => onSelectStation(line.previousStation!.name, lineName)} accessibilityRole="button" accessibilityLabel={`이전 역 ${line.previousStation.name}`} style={s.adjacentButton}><Text numberOfLines={1} style={s.adjacentText}>‹ {line.previousStation.name}</Text></Pressable> : <Text style={s.adjacentUnavailable}>이전 역 미제공</Text>}
          <View style={[s.currentStation, { borderColor: color }]}><View style={[s.badge, { backgroundColor: color }]}><Text style={s.badgeText}>{lineBadge}</Text></View><Text style={s.currentText}>{stationName.replace(/역$/, '')}</Text></View>
          {line?.nextStation && onSelectStation ? <Pressable onPress={() => onSelectStation(line.nextStation!.name, lineName)} accessibilityRole="button" accessibilityLabel={`다음 역 ${line.nextStation.name}`} style={s.adjacentButton}><Text numberOfLines={1} style={[s.adjacentText, { textAlign: 'right' }]}>{line.nextStation.name} ›</Text></Pressable> : <Text style={[s.adjacentUnavailable, { textAlign: 'right' }]}>다음 역 미제공</Text>}
        </View>
        <View style={s.liveToolbar}>
          <View style={s.segment}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: tab === 'live' }} onPress={() => setTab('live')} style={[s.segmentButton, tab === 'live' && s.liveSelected]}><Text style={[s.segmentText, { color: tab === 'live' ? GREEN : GRAY }]}>실시간</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: tab !== 'live' }} onPress={() => setTab('timetable')} style={[s.segmentButton, tab !== 'live' && s.scheduleSelected]}><Text style={[s.segmentText, { color: tab !== 'live' ? INK : GRAY }]}>시간표</Text></Pressable>
          </View>
          <View style={s.refreshRow}><Text style={s.clock}>{updatedAt}</Text><Pressable onPress={() => void query.refetch()} disabled={query.isFetching} accessibilityRole="button" accessibilityLabel="도착정보 새로고침" style={s.refresh}>{query.isFetching ? <ActivityIndicator size="small" color={GRAY} /> : <Text style={s.refreshIcon}>↻</Text>}</Pressable></View>
        </View>
        <>
          {query.isError ? <Text style={s.error}>{errorMessage}</Text> : null}
          {query.isPending ? <ActivityIndicator color={BLUE} /> : null}
          {detailDirection ? <Pressable onPress={() => setDetailDirection('')} accessibilityRole="button"><Text style={s.link}>‹ 전체 방면</Text></Pressable> : null}
          <View style={s.directionCards}>
            {displayedDirections.map(direction => {
              const directionTrains = lineArrivals.filter(arrival => arrival.direction === direction);
              const ended = serviceStatus(direction) === '운행종료' && !directionTrains.some(arrival => !arrivalTime(arrival).stale);
              const trains = ended ? [] : directionTrains;
              return <View key={direction} style={s.directionCard}>
                <Pressable accessibilityRole="button" accessibilityLabel={`${directionLabel(direction)} 상세 도착정보`} onPress={() => setDetailDirection(direction)} style={s.directionHeader}><Text style={s.directionTitle}>{directionLabel(direction)}</Text><Text style={s.chevron}>›</Text></Pressable>
                {(detailDirection ? trains : trains.slice(0, 2)).map(arrival => {
                  const time = arrivalTime(arrival);
                  return <View key={arrival.id} style={s.train}><Text style={s.trainDestination}>{arrival.destination ? `${arrival.destination}행` : '행선지 미제공'}{arrival.isLastTrain ? ' · 막차' : ''}</Text><Text style={[s.trainTime, { color: time.stale ? GRAY : '#E44136' }]}>{time.text}</Text>{detailDirection && arrival.locationMessage ? <Text style={s.trainLocation}>{arrival.locationMessage}</Text> : null}</View>;
                })}
                {!trains.length ? <Text style={s.serviceStatus}>{serviceStatus(direction)}</Text> : null}
                {detailDirection && selectedLineId ? <Pressable onPress={() => openAlert(direction)} accessibilityRole="button" style={s.alertButton}><Text style={s.link}>도착 알림 설정</Text></Pressable> : null}
              </View>;
            })}
            {!query.isPending && !directions.length ? <View style={s.emptyCard}><Text style={s.unavailable}>현재 제공되는 실시간 도착정보가 없습니다.</Text></View> : null}
          </View>
        </>
        <View style={s.transferRow}><Text style={s.transferTitle}>환승역</Text>{lines.map(([name]) => <Pressable key={name} onPress={() => setLine(name)} accessibilityRole="button" accessibilityLabel={`${name} 선택`} accessibilityState={{ selected: name === lineName }} style={[s.badge, { backgroundColor: LINE_COLORS[name] ?? BLUE }]}><Text style={s.badgeText}>{name.replace('호선', '')}</Text></Pressable>)}</View>
      </View>
      <View style={s.sectionDivider} />
      <View style={s.infoSection}><Text style={s.sectionTitle}>노선도</Text><View style={s.networkPanel}>
        {line?.stations.length ? <Pressable onPress={() => setShowNetwork(true)} accessibilityRole="button" style={s.networkLabel}><SymbolView name={{ ios: 'tram.circle', android: 'train', web: 'train' }} tintColor={color} size={20} /><Text style={s.networkLabelText}>지하철 노선도</Text></Pressable> : null}
        {line?.stations.length ? <ScrollView key={line.stationCode} horizontal showsHorizontalScrollIndicator={false} contentOffset={{ x: Math.max(0, line.stations.findIndex(item => item.stationCode === line.stationCode) - 3) * 59, y: 0 }} contentContainerStyle={s.networkStations}>
          {line.stations.map(item => <Pressable key={item.stationCode} accessibilityRole="button" accessibilityLabel={`${item.name}역 선택`} accessibilityState={{ selected: item.stationCode === line.stationCode }} onPress={() => onSelectStation?.(item.name, lineName)} style={s.networkStation}>
            <View style={[s.networkTrack, { backgroundColor: color }]} /><View style={[s.networkDot, { borderColor: color, borderWidth: item.stationCode === line.stationCode ? 4 : 1, width: item.stationCode === line.stationCode ? 17 : 10, height: item.stationCode === line.stationCode ? 17 : 10 }]} />
            <Text style={[s.networkStationText, item.stationCode === line.stationCode && { color: INK, fontWeight: '700' }]}>{item.name}</Text>
          </Pressable>)}
        </ScrollView> : <Text style={s.unavailable}>{station.isPending ? '노선도 조회 중' : '이 노선의 공식 역간 노선도를 제공하지 않습니다.'}</Text>}
      </View></View>
      <View style={s.sectionDivider} />
      <View style={s.infoSection}><Text style={s.sectionTitle}>역정보</Text>
        {facilities.data?.contacts.filter(item => item.lineName === lineName).map(item => <View key={`${item.lineName}:${item.phone}`} style={{ gap: 7, marginTop: 16 }}><Text style={s.unavailable}>{item.address}</Text><Text style={s.unavailable}>{item.phone}</Text></View>)}
        <View style={s.infoRule} /><Text style={s.facilityTitle}>시설정보</Text>
        {facilities.isPending ? <ActivityIndicator color={BLUE} /> : facilities.isError ? <View style={{ gap: 8 }}><Text style={s.error}>시설정보를 불러오지 못했습니다.</Text><Pressable onPress={() => void facilities.refetch()} accessibilityRole="button"><Text style={s.link}>다시 조회</Text></Pressable></View> : facilities.data?.elevators.length ? <View style={{ gap: 10 }}><Text style={s.unavailable}>엘리베이터 위치 {facilities.data.elevators.length}개 지점 · {facilities.data.elevatorSourceYear}년 기준</Text><Text style={s.unavailable}>공식 위치 자료이며 현재 운행 여부는 제공되지 않습니다.</Text>{onSelectStation ? <Pressable onPress={() => onSelectStation(stationName, lineName, facilities.data!.elevators[0])} accessibilityRole="button"><Text style={s.link}>첫 번째 엘리베이터 지점 지도 보기</Text></Pressable> : null}</View> : <Text style={s.unavailable}>공개된 시설정보가 없습니다.</Text>}
        {facilities.data ? <Text style={s.attribution}>{facilities.data.attribution}</Text> : query.data ? <Text style={s.attribution}>{query.data.attribution}</Text> : null}
      </View>
    </BottomSheetScrollView>
  </MapBottomSheet><SubwayTimetableModal stationName={stationName} lineId={selectedLineId} lineName={lineName} dayType={dayType} mode={tab} onClose={() => setTab('live')} onDayChange={setChosenDay} />
    <Modal visible={showNetwork} animationType="slide" onRequestClose={() => setShowNetwork(false)}><SafeAreaProvider><SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}><View style={[s.fullToolbar, { paddingHorizontal: 18 }]}><Pressable onPress={() => setShowNetwork(false)} accessibilityRole="button" accessibilityLabel="노선도 닫기" style={s.toolbarControl}><SymbolView name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={24} tintColor={INK} /></Pressable><Text style={[s.sectionTitle, { color }]}>{lineName} 노선도</Text></View><FlatList data={line?.stations ?? []} keyExtractor={item => item.stationCode} renderItem={({ item }) => <Pressable onPress={() => { setShowNetwork(false); onSelectStation?.(item.name, lineName); }} accessibilityRole="button" style={s.stationListRow}><View style={[s.badge, { backgroundColor: color }]}><Text style={s.badgeText}>{item.stationNumber}</Text></View><Text style={s.sectionTitle}>{item.name}</Text></Pressable>} /></SafeAreaView></SafeAreaProvider></Modal>
  </>;
}

const s = StyleSheet.create({
  content: { paddingBottom: 32, backgroundColor: 'white' }, header: { paddingHorizontal: 16, paddingTop: 8 },
  fullToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 }, toolbarControl: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  adjacentButton: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, adjacentText: { color: 'white', fontSize: 13 }, serviceStatus: { color: GRAY, fontSize: 15, textAlign: 'center', marginTop: 18 }, networkLabel: { borderWidth: 1, borderColor: '#E3E3E3', borderRadius: 24, backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-end', margin: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }, networkLabelText: { fontSize: 14, color: INK }, networkStations: { paddingTop: 25, paddingBottom: 22 }, networkStation: { width: 59, minHeight: 65, alignItems: 'center', paddingTop: 12 }, networkTrack: { position: 'absolute', top: 19, left: 0, right: 0, height: 3 }, networkDot: { backgroundColor: 'white', borderRadius: 12, height: 10, width: 10 }, networkStationText: { marginTop: 10, color: GRAY, fontSize: 13, textAlign: 'center', paddingHorizontal: 3 }, stationListRow: { minHeight: 58, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, title: { fontSize: 25, fontWeight: '700', color: INK, flex: 1, letterSpacing: -.8 },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F2F3F5', alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontSize: 17, color: '#555', marginTop: 12 }, actions: { paddingHorizontal: 16, gap: 5, paddingVertical: 20 }, action: { height: 41, paddingHorizontal: 13, borderRadius: 24, borderWidth: 1, borderColor: '#E5E5E5', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, actionText: { fontSize: 16, fontWeight: '500', color: INK }, departure: { backgroundColor: '#E8F1FF', borderColor: '#E8F1FF', minWidth: 70 }, destination: { backgroundColor: BLUE, borderColor: BLUE, minWidth: 70 },
  rule: { height: 1, backgroundColor: '#F0F0F0' }, arrivalSection: { paddingHorizontal: 18, paddingTop: 24 }, rail: { height: 29, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 9 }, adjacentUnavailable: { flex: 1, fontSize: 10, color: '#FFF', paddingHorizontal: 8 }, currentStation: { borderWidth: 3, borderRadius: 28, backgroundColor: 'white', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 43, minWidth: 136, paddingHorizontal: 12 }, currentText: { fontSize: 19, color: '#444' }, badge: { minWidth: 19, height: 20, paddingHorizontal: 5, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, badgeText: { fontSize: 14, color: 'white', fontWeight: '500' },
  liveToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 10 }, segment: { flexDirection: 'row', borderWidth: 1, borderColor: '#E6E6E6', borderRadius: 20 }, segmentButton: { paddingHorizontal: 12, height: 31, justifyContent: 'center', borderWidth: 1, borderColor: 'transparent', borderRadius: 20 }, liveSelected: { borderColor: GREEN }, scheduleSelected: { borderColor: GRAY }, segmentText: { fontSize: 14, fontWeight: '600' }, refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, clock: { color: GRAY, fontSize: 17 }, refresh: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: '#E8E8E8', alignItems: 'center', justifyContent: 'center' }, refreshIcon: { color: GRAY, fontSize: 22, lineHeight: 25 },
  directionCards: { flexDirection: 'row', alignItems: 'stretch', gap: 9 }, directionCard: { flex: 1, minHeight: 108, borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 6, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 10 }, directionHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingBottom: 8 }, directionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#444' }, chevron: { fontSize: 24, color: '#555' }, train: { gap: 3, paddingTop: 10 }, trainDestination: { fontSize: 12, color: '#555' }, trainTime: { fontSize: 14, fontWeight: '600' }, trainLocation: { fontSize: 12, color: GRAY }, alertButton: { marginTop: 14, minHeight: 40, justifyContent: 'center' },
  transferRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 20, marginBottom: 20 }, transferTitle: { fontSize: 15, fontWeight: '700', color: INK }, sectionDivider: { height: 9, backgroundColor: '#F1F1F1' }, infoSection: { paddingHorizontal: 18, paddingVertical: 20 }, sectionTitle: { fontSize: 19, fontWeight: '700', color: INK }, networkPanel: { backgroundColor: '#F8F8F8', borderWidth: 1, borderColor: '#E4E4E4', borderRadius: 4, marginTop: 18, minHeight: 150, alignItems: 'center', justifyContent: 'center' }, infoRule: { height: 1, backgroundColor: '#EEE', marginHorizontal: -18, marginVertical: 16 }, facilityTitle: { fontSize: 17, fontWeight: '600', color: '#555', marginBottom: 12 }, unavailable: { fontSize: 14, lineHeight: 21, color: GRAY }, emptyCard: { minHeight: 108, flex: 1, borderWidth: 1, borderColor: '#E1E1E1', borderRadius: 6, alignItems: 'center', justifyContent: 'center', padding: 14 }, error: { fontSize: 13, color: '#D83F35', marginVertical: 8 }, link: { fontSize: 14, color: BLUE }, attribution: { marginTop: 20, color: GRAY, fontSize: 11 },
});
