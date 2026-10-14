import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AppButton, useAppTheme } from '@/shared/ui/design-system';
import { getDirections, searchPlaces, type Journey, type Place, type Point, type TravelMode } from '../api/mobility';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { SavedPlaces } from './saved-places';
import { JourneyResults } from './journey-results';
import { readPlaceHistory, savePlaceHistory } from '../model/search-history';

type Props = { position: Point; top: number; left?: number; onPlace: (place: Place | null, showBusStop?: boolean) => void; getPosition: () => Promise<Point | null>; onGeometry: (lines: Point[][]) => void; onActivate: () => void; onSheetHeight: (height: number) => void; onSubway: (stationName: string, lineName?: string) => void; onPlanningChange?: (active: boolean) => void; onEndpoints?: (start: Place | null, end: Place | null) => void; routeIntent?: { id: number; place: Place; field: 'start' | 'end' } | null; suspended?: boolean };

/** 장소 탐색과 출발·도착 편집은 로컬 상태, 검색 결과와 경로는 Query 캐시가 관리한다. */
export function MobilitySearch({ position, top, left = 16, onPlace, onGeometry, onActivate, onSheetHeight, onSubway, getPosition, onPlanningChange, onEndpoints, routeIntent, suspended = false }: Props) {
  const { colors: appColors, type } = useAppTheme();
  const colors = { ...appColors, accent: mapUi.blue, accentSurface: mapUi.blueSurface, surface: mapUi.background, background: mapUi.background, text: mapUi.text, secondaryText: mapUi.secondaryText, separator: mapUi.border, secondarySurface: mapUi.separator };
  const input = useRef<TextInput>(null);
  const selection = useRef(0);
  const handledIntent = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
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
  const [mapVisible, setMapVisible] = useState(false);
  const [positionBusy,setPositionBusy]=useState(false);
  const current: Place = { id: 'current', name: '현재 위치', address: '', category: '', distanceMeters: 0, ...position };
  useEffect(() => { let alive = true; void readPlaceHistory().then(value => { if (alive) setRecent(value); }).catch(() => console.warn('최근 장소 읽기 실패')); return () => { alive = false; }; }, []);
  useEffect(() => { const timer = setTimeout(() => setQuery(text.trim()), 300); return () => clearTimeout(timer); }, [text]);
  useEffect(()=>{if(open)input.current?.focus();},[open,field]);
  useEffect(()=>()=>{selection.current++;},[]);
  useEffect(() => { onPlanningChange?.(planning || open || savedOpen || Boolean(chosen)); }, [planning, open, savedOpen, chosen, onPlanningChange]);
  useEffect(() => { onEndpoints?.(planning ? start : null, planning ? end : null); }, [planning, start, end, onEndpoints]);
  useEffect(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
    if (savedOpen) { setSavedOpen(false); return true; }
    if (open) { setOpen(false); Keyboard.dismiss(); return true; }
    if (mapVisible) { setMapVisible(false); return true; }
    if (selectedJourney) { setSelectedJourney(null); onGeometry([]); return true; }
    if (request) { clearRoute(); return true; }
    if (planning) { setPlanning(false); onPlace(null); return true; }
    return false;
  }); return () => subscription.remove(); });
  const handleRouteIntent = useEffectEvent(() => {
    if (!routeIntent || handledIntent.current === routeIntent.id) return;
    handledIntent.current = routeIntent.id;
    onActivate(); clearRoute(); setPlanning(true); setChosen(null); setText(''); setQuery('');
    if (routeIntent.field === 'end') {
      setStart(current); setEnd(routeIntent.place); setOpen(false);
      void searchJourney(current, routeIntent.place);
    } else {
      setStart(routeIntent.place); setEnd(null); setField('end'); setOpen(true);
    }
  });
  // 역 시트가 닫힌 다음 프레임에 외부 출발·도착 요청을 적용한다.
  useEffect(() => {
    if (!routeIntent) return;
    const frame = requestAnimationFrame(() => handleRouteIntent());
    return () => cancelAnimationFrame(frame);
  }, [routeIntent]);
  const places = useQuery({ queryKey: ['mobility', 'places', query, position.latitude, position.longitude],
    queryFn: ({ signal }) => searchPlaces(query, position, signal), enabled: open && query.length >= 2, staleTime: 60_000, retry: false });
  const journeys = useQuery({ queryKey: ['mobility', 'directions', request],
    queryFn: ({ signal }) => getDirections(request!.start, request!.end, request!.mode, signal), enabled: Boolean(request), staleTime: 60_000, retry: false });

  function clearRoute() { selection.current++; setPositionBusy(false); setRequest(null); setSelectedJourney(null); setMapVisible(false); onGeometry([]); onSheetHeight(0); }
  function edit(next: 'place' | 'start' | 'end') { setField(next); setText(''); setQuery(''); setOpen(true); input.current?.focus(); }
  function searchCategory(name: string) { onActivate(); setField('place'); setText(name); setQuery(name); setOpen(true); }
  function remember(place: Place) {
    if (place.id === 'current') return;
    const next = [place, ...recent.filter(p => p.id !== place.id)].slice(0, 10); setRecent(next);
    void savePlaceHistory(next).catch(() => console.warn('최근 장소 저장 실패'));
  }
  function choose(place: Place) {
    remember(place); Keyboard.dismiss(); setText(''); setQuery(''); setOpen(false);
    if (field === 'start') {clearRoute();setStart(place);onPlace(place,false); if (end) void searchJourney(place, end);}
    else if (field === 'end') {clearRoute();setEnd(place);onPlace(place,false); if (start) void searchJourney(start, place);}
    else { setChosen(place); onPlace(place,true); }
  }
  function beginPlanning(place?: Place) {
    onActivate();clearRoute(); setPlanning(true); setStart(current); setEnd(place ?? chosen); setChosen(null); setOpen(false); setField('end'); setText('');
    if (place || chosen) void searchJourney(current, place ?? chosen);
  }
  function selectJourney(journey: Journey) {
    setSelectedJourney(journey.id);
    onGeometry(journey.geometry);

  }
  async function searchJourney(startPlace = start, endPlace = end, nextMode = mode) {
    if(!startPlace || !endPlace)return;
    clearRoute();Keyboard.dismiss();
    const revision=selection.current;
    setPositionBusy(true);
    try {
      const fresh=(startPlace.id==='current' || endPlace.id==='current') ? await getPosition() : null;
      if(revision!==selection.current || ((!fresh) && (startPlace.id==='current'||endPlace.id==='current')))return;
      const nextStart = startPlace.id === 'current' ? { ...startPlace, ...fresh! } : startPlace;
      const nextEnd = endPlace.id === 'current' ? { ...endPlace, ...fresh! } : endPlace;
      setStart(nextStart); setEnd(nextEnd);
      setRequest({ start: nextStart, end: nextEnd, mode: nextMode });
    } finally {if(revision===selection.current)setPositionBusy(false);}
  }
  const row = (place: Place) => <Pressable accessibilityRole="button" onPress={() => choose(place)} style={{ paddingVertical: 14, flexDirection: 'row', gap: 12, borderBottomWidth: .5, borderBottomColor: colors.separator }}>
    <SymbolView name={{ ios: place.category === '주소' ? 'mappin.circle' : 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }} size={24} tintColor={colors.accent} />
    <View style={{ flex: 1, gap: 4 }}><Text style={{ ...type.headline, color: colors.text }}>{place.name.replace(/\[.*?\]/g, '')}</Text><Text style={{ ...type.footnote, color: colors.secondaryText }}>{place.address || place.category}</Text></View>
    {place.distanceMeters != null ? <Text style={{ color: colors.secondaryText, fontSize: 12 }}>{place.distanceMeters >= 1000 ? `${(place.distanceMeters / 1000).toFixed(1)}km` : `${Math.round(place.distanceMeters)}m`}</Text> : null}
  </Pressable>;

  return <>
    {open || (planning && request && !mapVisible) ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.background }} /> : null}
    <View style={{ position: 'absolute', top, left: open ? 0 : planning ? 16 : left, right: open ? 0 : 16, gap: 12 }}>
      {planning && !open ? <View style={{ backgroundColor: colors.surface, paddingHorizontal: 4, paddingVertical: 8, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.separator, borderRadius: 8 }}>
          <Pressable accessibilityLabel="출발 도착 바꾸기" onPress={() => { clearRoute(); setStart(end); setEnd(start); if (start && end) void searchJourney(end, start); }} style={{ padding: 12 }}><Text style={{ color: colors.secondaryText, fontSize: 22 }}>⇅</Text></Pressable>
          {request ? <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={() => edit('start')} style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.text }}><Text style={{ color: colors.success }}>● </Text>{start?.name.replace(/\[.*?\]/g, '')}</Text></Pressable>
            <Text style={{ color: colors.secondaryText }}>→</Text><Pressable onPress={() => edit('end')} style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: colors.text }}><Text style={{ color: colors.danger }}>● </Text>{end?.name.replace(/\[.*?\]/g, '')}</Text></Pressable>
          </View> : <View style={{ flex: 1 }}><Endpoint label="출발" value={start?.name ?? '출발지 입력'} onPress={() => edit('start')} /><Endpoint label="도착" value={end?.name ?? '도착지 입력'} onPress={() => edit('end')} /></View>}
          <Pressable accessibilityLabel="길찾기 닫기" onPress={() => { clearRoute(); setPlanning(false); onPlace(null); }} style={{ padding: 12 }}><Text style={{ color: colors.secondaryText, fontSize: 24 }}>×</Text></Pressable>
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {(['transit', 'bus', 'walk'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => { clearRoute(); setMode(value); if (start && end) void searchJourney(start, end, value); }} style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 6, borderRadius: 24, backgroundColor: mode === value ? colors.accent : 'transparent' }}><SymbolView name={value === 'walk' ? { ios: 'figure.walk', android: 'directions_walk', web: 'directions_walk' } : { ios: 'bus.fill', android: 'directions_bus', web: 'directions_bus' }} size={22} tintColor={mode === value ? colors.onAccent : colors.text} /><Text style={{ textAlign: 'center', color: mode === value ? colors.onAccent : colors.text, fontWeight: '600' }}>{value === 'transit' ? '대중교통' : value === 'bus' ? '버스' : '도보'}</Text></Pressable>)}
        </View>
        {positionBusy ? <ActivityIndicator color={colors.accent} /> : null}
      </View> : null}
      {open ? <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: .5, borderColor: colors.separator, minHeight: 54 }}>
        <Pressable accessibilityLabel="검색 뒤로" onPress={() => { setOpen(false); Keyboard.dismiss(); }} style={{ padding: 12 }}><SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor={colors.text} /></Pressable>
        <TextInput ref={input} value={text} maxLength={100} onChangeText={setText} placeholder={planning ? `${field === 'start' ? '출발지' : '도착지'} 검색` : '장소, 버스, 지하철, 주소 검색'} placeholderTextColor={colors.secondaryText} style={{ flex: 1, color: colors.text, fontSize: 17, paddingVertical: 12 }} returnKeyType="search" onSubmitEditing={() => setQuery(text.trim())} />
        {text ? <Pressable accessibilityLabel="검색어 지우기" onPress={() => { setText(''); setQuery(''); }} style={{ padding: 12 }}><SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} size={20} tintColor={colors.tertiaryText} /></Pressable> : null}
      </View> : !planning ? <>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ flex: 1, height: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 28, backgroundColor: colors.surface, paddingLeft: 16, paddingRight: 12, boxShadow: '0 2px 6px #00000024' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="장소 검색" onPress={() => { onActivate(); edit('place'); }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, height: 50 }}>
              <View style={{ width: 26, height: 31, borderRadius: 14, borderBottomRightRadius: 4, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 20, color: colors.onAccent, fontWeight: '800' }}>T</Text></View>
              <Text numberOfLines={1} style={{ fontSize: 17, color: '#44474A', flex: 1 }}>타라고 검색</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="내 장소" onPress={() => { onActivate(); setSavedOpen(true); }} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#DBEEEA', alignItems: 'center', justifyContent: 'center' }}><SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={23} tintColor="#559C8A" /></Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="길찾기" onPress={() => beginPlanning()} style={{ height: 50, width: 50, borderRadius: 25, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px #00000024' }}><SymbolView name={{ ios: 'arrow.turn.up.right', android: 'turn_right', web: 'turn_right' }} size={28} tintColor={colors.onAccent} /></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
          {HOME_CATEGORIES.map(category => <Pressable key={category.label} accessibilityRole="button" onPress={() => searchCategory(category.label)} style={{ flexDirection: 'row', gap: 7, alignItems: 'center', height: 34, paddingHorizontal: 13, borderRadius: 18, backgroundColor: colors.surface, boxShadow: '0 2px 4px #00000020' }}><SymbolView name={category.symbol} size={17} tintColor={category.color} /><Text style={{ color: colors.text, fontSize: 14 }}>{category.label}</Text></Pressable>)}
        </ScrollView>
      </> : null}
    </View>
    {open ? <View style={{ position: 'absolute', top: top + 68, left: 20, right: 20, bottom: 16 }}>
      {planning ? <Pressable accessibilityRole="button" onPress={() => choose(current)} style={{ paddingVertical: 14 }}><Text style={{ ...type.headline, color: colors.accent }}>현재 위치 사용</Text></Pressable> : null}
      {query.length < 2 ? <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 }}><Text style={{ ...type.headline, color: colors.text }}>최근 검색</Text><Pressable accessibilityLabel="최근 검색 지우기" onPress={() => { setRecent([]); void savePlaceHistory([]).catch(() => console.warn('최근 장소 삭제 실패')); }}><Text style={{ color: colors.secondaryText }}>전체 삭제</Text></Pressable></View> : null}
      {places.isFetching ? <ActivityIndicator color={colors.accent} /> : null}
      {places.isError && query.length >= 2 ? <Text style={{ color: colors.danger, paddingVertical: 12 }}>{message(places.error)}</Text> : null}
      {query.length >= 2 && !places.isFetching && !places.isError && !places.data?.length ? <Text style={{ color: colors.secondaryText, paddingVertical: 16 }}>검색 결과가 없습니다.</Text> : null}
      <FlatList data={query.length >= 2 ? places.data ?? [] : recent} keyExtractor={p => p.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" renderItem={({ item }) => row(item)} ListFooterComponent={query.length < 2 && !planning ? <View style={{ marginTop: 28, gap: 18 }}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>추천 카테고리</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>{HOME_CATEGORIES.map(category => <Pressable key={category.label} accessibilityRole="button" onPress={() => searchCategory(category.label)} style={{ alignItems: 'center', gap: 10, flex: 1 }}><View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: colors.secondarySurface, justifyContent: 'center', alignItems: 'center' }}><SymbolView name={category.symbol} size={25} tintColor={category.color} /></View><Text style={{ color: colors.text, fontSize: 12 }}>{category.label}</Text></Pressable>)}</View>
      </View> : null} />
    </View> : null}
    {!suspended && !open && chosen && !planning ? <View onLayout={event => onSheetHeight(event.nativeEvent.layout.height)} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, gap: 16 }}>
      <View style={{ width: 42, height: 5, borderRadius: 3, backgroundColor: colors.tertiaryText, alignSelf: 'center', marginBottom: 8 }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: colors.text, fontSize: 23, fontWeight: '700', flex: 1 }}>{chosen.name.replace(/\[.*?\]/g, '')}</Text><Pressable accessibilityLabel="장소 닫기" onPress={() => { setChosen(null); onPlace(null); onSheetHeight(0); }} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondarySurface, alignItems: 'center', justifyContent: 'center' }}><SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor={colors.text} /></Pressable></View>
      <Text style={{ color: colors.secondaryText, fontSize: 15 }}>{chosen.address}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => { const place = chosen; onActivate(); clearRoute(); setPlanning(true); setChosen(null); setStart(place); setEnd(null); setField('end'); setOpen(true); }} style={{ paddingHorizontal: 24, minHeight: 40, borderRadius: 24, backgroundColor: colors.accentSurface, justifyContent: 'center' }}><Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600' }}>출발</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => beginPlanning(chosen)} style={{ paddingHorizontal: 24, minHeight: 40, borderRadius: 24, backgroundColor: colors.accent, justifyContent: 'center' }}><Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '600' }}>도착</Text></Pressable>
        {isSubwayPlace(chosen) ? <Pressable accessibilityRole="button" onPress={() => { onSubway(chosen.name); setChosen(null); }} style={{ paddingHorizontal: 14, minHeight: 40, borderRadius: 24, borderWidth: 1, borderColor: colors.separator, justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 13 }}>실시간 도착</Text></Pressable> : null}
      </View>
    </View> : null}
    {!suspended && !open && planning && request ? <>
      {mapVisible ? <Pressable onPress={() => setMapVisible(false)} style={{ position: 'absolute', bottom: 110, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: 24, padding: 16 }}><Text style={{ color: colors.accent, fontWeight: '600' }}>목록 보기</Text></Pressable> : null}
      <View style={{ position: 'absolute', top: top + 128, left: 0, right: 0, bottom: mapVisible ? undefined : 0, backgroundColor: colors.surface }}>
        {!mapVisible ? <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {journeys.isFetching ? <ActivityIndicator style={{ margin: 24 }} color={colors.accent} /> : null}
          {journeys.isError ? <View style={{ padding: 20, gap: 12 }}><Text style={{ color: colors.danger }}>{message(journeys.error)}</Text><AppButton title="다시 시도" variant="secondary" onPress={() => void journeys.refetch()} /></View> : null}
          {!journeys.isFetching && !journeys.isError && journeys.data?.paths.length === 0 ? <Text style={{ color: colors.secondaryText, padding: 20 }}>이 구간에서 이용할 수 있는 경로가 없습니다.</Text> : null}
          {journeys.data ? <JourneyResults paths={journeys.data.paths} selectedId={selectedJourney} startName={request.start.name} endName={request.end.name} onSelect={selectJourney} onBack={() => { setSelectedJourney(null); onGeometry([]); }} onGeometry={lines => { onGeometry(lines); setMapVisible(true); onSheetHeight(0); }} onSubway={onSubway} /> : null}
          {journeys.data ? <Text style={{ color: colors.secondaryText, fontSize: 11, padding: 20 }}>{journeys.data.attribution}</Text> : null}
        </ScrollView> : null}
      </View>
    </> : null}
    {savedOpen && !suspended ? <SavedPlaces top={top} places={recent} onClose={() => setSavedOpen(false)} onPlace={place => { setSavedOpen(false); setField('place'); remember(place); setChosen(place); onPlace(place, true); }} onSubway={(station, line) => { setSavedOpen(false); onSubway(station, line); }} /> : null}
  </>;
}

function Endpoint({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  const { colors: appColors } = useAppTheme();
  const colors = { ...appColors, accent: mapUi.blue, accentSurface: mapUi.blueSurface, surface: mapUi.background, background: mapUi.background, text: mapUi.text, secondaryText: mapUi.secondaryText, separator: mapUi.border, secondarySurface: mapUi.separator };
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

const HOME_CATEGORIES = [
  { label: '음식점', color: '#ff8700', symbol: { ios: 'fork.knife', android: 'restaurant', web: 'restaurant' } },
  { label: '카페', color: '#ff8700', symbol: { ios: 'cup.and.saucer.fill', android: 'local_cafe', web: 'local_cafe' } },
  { label: '편의점', color: '#eab900', symbol: { ios: 'basket.fill', android: 'shopping_basket', web: 'shopping_basket' } },
  { label: '지하철역', color: '#2c73dd', symbol: { ios: 'tram.fill', android: 'subway', web: 'subway' } },
] as const;
