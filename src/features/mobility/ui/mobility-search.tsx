import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AppButton, useAppTheme } from '@/shared/ui/design-system';
import { MapBottomSheet } from '@/shared/ui/map-bottom-sheet';
import type { MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { getDirections, searchPlaces, type Journey, type Place, type Point, type TravelMode } from '../api/mobility';
import { JourneyResults } from './journey-results';
import { readPlaceHistory, savePlaceHistory } from '../model/search-history';

type Props = { position: Point; top: number; left?: number; onPlace: (place: Place | null, showBusStop?: boolean) => void; getPosition: () => Promise<Point | null>; onGeometry: (lines: Point[][]) => void; onActivate: () => void; onSheetHeight: (height: number) => void; onSubway: (stationName: string) => void; suspended?: boolean };

/** 장소 탐색과 출발·도착 편집은 로컬 상태, 검색 결과와 경로는 Query 캐시가 관리한다. */
export function MobilitySearch({ position, top, left = 16, onPlace, onGeometry, onActivate, onSheetHeight, onSubway, getPosition, suspended = false }: Props) {
  const { colors, radius, type } = useAppTheme();
  const input = useRef<TextInput>(null);
  const selection = useRef(0);
  const [open, setOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [field, setField] = useState<'place' | 'start' | 'end'>('place');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Place[]>([]);
  const [chosen, setChosen] = useState<Place | null>(null);
  const [start, setStart] = useState<Place | null>(null);
  const [end, setEnd] = useState<Place | null>(null);
  const [mode, setMode] = useState<TravelMode>('transit');
  const [request, setRequest] = useState<{ start: Place; end: Place; mode: TravelMode } | null>(null);
  const [selectedJourney, setSelectedJourney] = useState<string | null>(null);
  const [positionBusy,setPositionBusy]=useState(false);
  const [journeySnap,setJourneySnap]=useState<MapSheetSnap>('half');
  const current: Place = { id: 'current', name: '현재 위치', address: '', category: '', distanceMeters: 0, ...position };
  useEffect(() => { let alive = true; void readPlaceHistory().then(value => { if (alive) setRecent(value); }).catch(() => console.warn('최근 장소 읽기 실패')); return () => { alive = false; }; }, []);
  useEffect(() => { const timer = setTimeout(() => setQuery(text.trim()), 300); return () => clearTimeout(timer); }, [text]);
  useEffect(()=>{if(open)input.current?.focus();},[open,field]);
  useEffect(()=>()=>{selection.current++;},[]);
  const places = useQuery({ queryKey: ['mobility', 'places', query, position.latitude, position.longitude],
    queryFn: ({ signal }) => searchPlaces(query, position, signal), enabled: open && query.length >= 2, staleTime: 60_000, retry: false });
  const journeys = useQuery({ queryKey: ['mobility', 'directions', request],
    queryFn: ({ signal }) => getDirections(request!.start, request!.end, request!.mode, signal), enabled: Boolean(request), staleTime: 60_000, retry: false });

  function clearRoute() { selection.current++; setPositionBusy(false); setRequest(null); setSelectedJourney(null); setJourneySnap('half'); onGeometry([]); onSheetHeight(0); }
  function edit(next: 'place' | 'start' | 'end') { clearRoute(); setField(next); setText(''); setQuery(''); setOpen(true); input.current?.focus(); }
  function remember(place: Place) {
    if (place.id === 'current') return;
    const next = [place, ...recent.filter(p => p.id !== place.id)].slice(0, 10); setRecent(next);
    void savePlaceHistory(next).catch(() => console.warn('최근 장소 저장 실패'));
  }
  function choose(place: Place) {
    remember(place); Keyboard.dismiss(); setText(''); setQuery(''); setOpen(false);
    if (field === 'start') {setStart(place);onPlace(place,false);}
    else if (field === 'end') {setEnd(place);onPlace(place,false);}
    else { setChosen(place); onPlace(place,true); }
  }
  function beginPlanning(place?: Place) {
    onActivate();clearRoute(); setPlanning(true); setStart(current); setEnd(place ?? chosen); setChosen(null); setOpen(false); setField('end'); setText('');
    if (!place && !chosen) { setOpen(true); input.current?.focus(); }
  }
  function selectJourney(journey: Journey) {
    setSelectedJourney(journey.id);
    onGeometry(journey.geometry);
    setJourneySnap('half');
  }
  async function searchJourney() {
    if(!start || !end)return;
    clearRoute();Keyboard.dismiss();
    const revision=selection.current;
    setPositionBusy(true);
    try {
      const fresh=(start.id==='current' || end.id==='current') ? await getPosition() : null;
      if(revision!==selection.current || ((!fresh) && (start.id==='current'||end.id==='current')))return;
      setRequest({start:start.id==='current' ? {...start,...fresh!} : start,end:end.id==='current' ? {...end,...fresh!} : end,mode});
    } finally {if(revision===selection.current)setPositionBusy(false);}
  }
  const row = (place: Place) => <Pressable accessibilityRole="button" onPress={() => choose(place)} style={{ paddingVertical: 14, flexDirection: 'row', gap: 12, borderBottomWidth: .5, borderBottomColor: colors.separator }}>
    <SymbolView name={{ ios: place.category === '주소' ? 'mappin.circle' : 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} size={24} tintColor={colors.accent} />
    <View style={{ flex: 1, gap: 4 }}><Text style={{ ...type.headline, color: colors.text }}>{place.name}</Text><Text style={{ ...type.footnote, color: colors.secondaryText }}>{place.address || place.category}</Text></View>
    {place.distanceMeters != null ? <Text style={{ color: colors.secondaryText, fontSize: 12 }}>{place.distanceMeters >= 1000 ? `${(place.distanceMeters / 1000).toFixed(1)}km` : `${Math.round(place.distanceMeters)}m`}</Text> : null}
  </Pressable>;

  return <>
    {open ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background }} /> : null}
    <View style={{ position: 'absolute', top, left: open || planning ? 16 : left, right: 16, gap: 12 }}>
      {planning ? <View style={{ backgroundColor: colors.surface, padding: 12, borderRadius: radius.lg, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text accessibilityRole="header" style={{ ...type.title, color: colors.text, flex: 1 }}>길찾기</Text><Pressable accessibilityLabel="길찾기 닫기" onPress={() => { clearRoute(); setPlanning(false); setOpen(false); onPlace(null); }} style={{ padding: 12 }}><Text style={{ color: colors.secondaryText, fontSize: 22 }}>×</Text></Pressable></View>
        <Endpoint label="출발" value={start?.name ?? '출발지 선택'} onPress={() => edit('start')} />
        <Endpoint label="도착" value={end?.name ?? '도착지 선택'} onPress={() => edit('end')} />
        {!request ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" onPress={() => { clearRoute(); setStart(current); }} style={{ padding: 12 }}><Text style={{ color: colors.accent }}>현재 위치에서</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { clearRoute(); const previous = start; setStart(end); setEnd(previous); }} style={{ padding: 12 }}><Text style={{ color: colors.accent }}>출발·도착 교환 ⇅</Text></Pressable>
        </View> : null}
        <View style={{ flexDirection: 'row', borderRadius: radius.sm, padding: 3, backgroundColor: colors.secondarySurface }}>
          {(['transit', 'bus', 'walk'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => { clearRoute(); setMode(value); }} style={{ flex: 1, minHeight: 44, justifyContent: 'center', borderRadius: 6, backgroundColor: mode === value ? colors.surface : 'transparent' }}><Text style={{ textAlign: 'center', color: colors.text, fontWeight: mode === value ? '600' : '400' }}>{value === 'transit' ? '대중교통' : value === 'bus' ? '버스' : '도보'}</Text></Pressable>)}
        </View>
        {!open && !request ? <AppButton title="경로 검색" disabled={!start || !end} loading={positionBusy} onPress={() => void searchJourney()} /> : null}
      </View> : null}
      {open || !planning ? <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: 12, minHeight: 52 }}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={20} tintColor={colors.secondaryText} />
        <TextInput ref={input} value={text} maxLength={100} onChangeText={setText} onFocus={() => { onActivate();setOpen(true); if (!planning) setField('place'); }} placeholder={planning ? `${field === 'start' ? '출발' : '도착'} 장소·주소 검색` : '장소, 주소 검색'} placeholderTextColor={colors.secondaryText} style={{ flex: 1, color: colors.text, fontSize: 17, padding: 12 }} returnKeyType="search" onSubmitEditing={() => setQuery(text.trim())} />
        {open ? <Pressable accessibilityLabel="검색 닫기" onPress={() => { setOpen(false); setText(''); setQuery(''); Keyboard.dismiss(); }} style={{ padding: 12 }}><Text style={{ color: colors.accent }}>취소</Text></Pressable> : <Pressable accessibilityRole="button" accessibilityLabel="앱에서 길찾기" onPress={() => beginPlanning()} style={{ padding: 12 }}><SymbolView name={{ ios: 'arrow.triangle.turn.up.right.diamond', android: 'directions', web: 'directions' }} size={24} tintColor={colors.accent} /></Pressable>}
      </View> : null}
    </View>
    {open ? <View style={{ position: 'absolute', top: top + (planning ? 318 : 68), left: 20, right: 20, bottom: 16 }}>
      {planning ? <Pressable accessibilityRole="button" onPress={() => choose(current)} style={{ paddingVertical: 14 }}><Text style={{ ...type.headline, color: colors.accent }}>현재 위치 사용</Text></Pressable> : null}
      {query.length < 2 ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }}><Text style={{ ...type.headline, color: colors.text }}>최근 검색</Text><Pressable accessibilityLabel="최근 검색 지우기" onPress={() => { setRecent([]); void savePlaceHistory([]).catch(() => console.warn('최근 장소 삭제 실패')); }}><Text style={{ color: colors.secondaryText }}>전체 삭제</Text></Pressable></View> : null}
      {places.isFetching ? <ActivityIndicator color={colors.accent} /> : null}
      {places.isError && query.length >= 2 ? <Text style={{ color: colors.danger, paddingVertical: 12 }}>{message(places.error)}</Text> : null}
      {query.length >= 2 && !places.isFetching && !places.isError && !places.data?.length ? <Text style={{ color: colors.secondaryText, paddingVertical: 16 }}>검색 결과가 없습니다.</Text> : null}
      <FlatList data={query.length >= 2 ? places.data ?? [] : recent} keyExtractor={p => p.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" renderItem={({ item }) => row(item)} />
    </View> : null}
    {!suspended && !open && chosen && !planning ? <View onLayout={event => onSheetHeight(event.nativeEvent.layout.height + 100)} style={{ position: 'absolute', bottom: 100, left: 16, right: 16, backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, gap: 12 }}>
      <View style={{ flexDirection: 'row' }}><Text style={{ ...type.title, color: colors.text, flex: 1 }}>{chosen.name}</Text><Pressable accessibilityLabel="장소 닫기" onPress={() => { setChosen(null); onPlace(null); }} style={{ padding: 8 }}><Text style={{ color: colors.secondaryText, fontSize: 22 }}>×</Text></Pressable></View>
      <Text style={{ color: colors.secondaryText }}>{chosen.address}</Text>
      {isSubwayPlace(chosen) ? <AppButton title="지하철 실시간 도착" variant="secondary" onPress={() => { onSubway(chosen.name); setChosen(null); }} /> : null}
      <View style={{flexDirection:'row',gap:12}}>
        <View style={{flex:1}}><AppButton title="출발" variant="secondary" onPress={()=>{const place=chosen;beginPlanning();setStart(place);setEnd(null);setField('end');setOpen(true);input.current?.focus();}} /></View>
        <View style={{flex:1}}><AppButton title="도착" onPress={() => beginPlanning(chosen)} /></View>
      </View>
    </View> : null}
    {!suspended && !open && planning && request ? <MapBottomSheet snap={journeySnap} onChangeSnap={setJourneySnap} onHeightChange={onSheetHeight}>
      <BottomSheetScrollView contentContainerStyle={{paddingHorizontal:20,paddingBottom:24}}>
      {journeys.isFetching ? <ActivityIndicator color={colors.accent} /> : null}
      {journeys.isError ? <View style={{ gap: 12 }}><Text style={{ color: colors.danger }}>{message(journeys.error)}</Text><AppButton title="다시 시도" variant="secondary" onPress={() => void journeys.refetch()} /></View> : null}
      {!journeys.isFetching && !journeys.isError && journeys.data?.paths.length === 0 ? <Text style={{ color: colors.secondaryText }}>이 구간에서 이용할 수 있는 경로가 없습니다.</Text> : null}
        {journeys.data ? <JourneyResults paths={journeys.data.paths} selectedId={selectedJourney} startName={request.start.name} endName={request.end.name} onSelect={selectJourney} onBack={() => { setSelectedJourney(null); onGeometry([]); setJourneySnap('half'); }} onGeometry={lines => { onGeometry(lines); setJourneySnap('compact'); }} onSubway={onSubway} /> : null}
        {journeys.data ? <Text style={{ color: colors.secondaryText, fontSize: 11, marginTop: 16 }}>{journeys.data.attribution}</Text> : null}
      </BottomSheetScrollView>
    </MapBottomSheet> : null}
  </>;
}

function Endpoint({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 12, borderBottomWidth: .5, borderColor: colors.separator }}><Text style={{ color: colors.secondaryText }}>{label}</Text><Text numberOfLines={1} style={{ color: colors.text, fontSize: 17, flex: 1 }}>{value}</Text></Pressable>;
}
function message(error: unknown) {
  if(isAxiosError(error) && error.response?.status===404)return '검색·길찾기 서비스가 아직 연결되지 않았습니다.';
  const value = isAxiosError(error) ? error.response?.data?.message : undefined;
  return typeof value === 'string' ? value : '정보를 불러오지 못했습니다. 연결 상태를 확인해주세요.';
}

function isSubwayPlace(place: Place) {
  return /지하철|전철|도시철도/.test(place.category) || /역(?:\s|$)/.test(place.name);
}
