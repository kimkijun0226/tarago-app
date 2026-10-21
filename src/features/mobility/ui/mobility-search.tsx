/** @fileoverview 지도 위 장소 검색·출발/도착 편집·경로 선택 흐름을 연결한다. 서버 결과는 Query, 편집 중 UI는 로컬 상태가 소유한다. */

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AppButton, useAppTheme } from '@/shared/ui';
import {
  getDirections,
  type Journey,
  type Place,
  type Point,
  type TravelMode,
} from '../api/mobility';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { RouteEditor } from './route-editor';
import { PlaceDetail } from './place-detail';
import { PlaceSearchResults } from './place-search-results';
import { SavedPlaces } from './saved-places';
import { JourneyResults } from './journey-results';
import { usePlaceShortcuts } from '../model/use-place-shortcuts';
import { usePlaceSearch, type SearchMapRequest } from '../model/use-place-search';
import { matchesSearchFilter, type SearchResultFilter } from '../model/place-kind';
import { MobilitySearchBar } from './mobility-search-bar';
import { MapSearchResults } from './map-search-results';
import { readPlaceHistory, savePlaceHistory } from '../model/search-history';

type Props = {
  position: Point;
  top: number;
  left?: number;
  onPlace: (place: Place | null, showBusStop?: boolean) => void;
  getPosition: () => Promise<Point | null>;
  onGeometry: (lines: Point[][]) => void;
  onActivate: () => void;
  onSheetHeight: (height: number) => void;
  onSubway: (stationName: string, lineName?: string) => void;
  onPlanningChange?: (active: boolean) => void;
  onEndpoints?: (start: Place | null, end: Place | null) => void;
  suspended?: boolean;
  onSearchMap: (request: SearchMapRequest | null) => void;
  selectedSearchId: string | null;
  onSearchSelect: (place: Place) => void;
};

/**
 * 장소 검색과 길찾기 편집 상태를 지도 콜백 및 서버 Query와 연결한다.
 * @param props 현재 좌표·지도 제어 콜백·외부 출발/도착 요청과 표시 조건.
 * @returns 검색창·검색 결과·선택 장소 또는 길찾기 UI. 핸들러는 최신 편집 상태를 사용하며 메모된 자식의 참조 계약이 없어 useCallback을 추가하지 않는다.
 */
export function MobilitySearch({
  position,
  top,
  left = 16,
  onPlace,
  onGeometry,
  onActivate,
  onSheetHeight,
  onSubway,
  getPosition,
  onPlanningChange,
  onEndpoints,
  suspended = false,
  onSearchMap,
  selectedSearchId,
  onSearchSelect,
}: Props) {
  /** 공통 앱 색상을 읽어 지도 전용 팔레트의 기본값으로 사용한다. */
  const { colors: appColors } = useAppTheme();

  /** 지도 검색 화면의 색상 토큰을 기본 테마에 덮어써 지도·카드·검색창의 색을 일치시킨다. */
  const colors = {
    ...appColors,
    accent: mapUi.blue,
    accentSurface: mapUi.blueSurface,
    surface: mapUi.background,
    background: mapUi.background,
    text: mapUi.text,
    secondaryText: mapUi.secondaryText,
    separator: mapUi.border,
    secondarySurface: mapUi.separator,
  };

  /** 입력창 인스턴스를 보관해 검색 모드 전환 후 포커스를 준다. ref 변경 자체는 화면을 갱신할 필요가 없다. */
  const input = useRef<TextInput>(null);

  /** 위치 조회의 세대 번호다. 취소·재선택·언마운트 뒤 늦게 도착한 좌표가 새 경로를 덮어쓰지 않게 한다. */
  const selection = useRef(0);

  /** 내 장소에서 뒤로 돌아올 때 검색 선택 화면을 복원할지 기억한다. 화면에 직접 표시하지 않는 전환 기록이다. */
  const savedFromSearch = useRef(false);

  /** 집·회사로 지정한 사용자 장소와 기기 저장 상태다. */
  const shortcuts = usePlaceShortcuts();

  /** 집·회사 등록을 위해 다음 검색 결과를 저장할 슬롯이다. */
  const [shortcutSlot, setShortcutSlot] = useState<'home' | 'work' | null>(null);

  /** 검색 입력과 결과 목록의 열림 여부다. 검색 모드에서는 지도 위 전체 검색 영역을 표시한다. */
  const [open, setOpen] = useState(false);
  const [mapResults, setMapResults] = useState(false);
  const [searchOrigin, setSearchOrigin] = useState<Point>(position);
  const [mapFilter, setMapFilter] = useState<SearchResultFilter>('all');
  const [searchSnap, setSearchSnap] = useState<MapSheetSnap>('half');

  /** 내 장소 화면을 표시할지 결정한다. */
  const [savedOpen, setSavedOpen] = useState(false);

  /** 일반 장소 탐색 대신 출발·도착을 편집하는 길찾기 모드인지 나타낸다. */
  const [planning, setPlanning] = useState(false);

  /** 검색 결과를 일반 장소·출발지·도착지 중 어디에 적용할지 정한다. */
  const [field, setField] = useState<'place' | 'start' | 'end'>('place');

  /** 사용자가 입력 중인 검색어 원문이다. 요청용 query와 분리해 디바운스를 적용한다. */
  const [text, setText] = useState('');

  /** 공백 정리와 디바운스가 적용된 실제 장소 Query 검색어다. */
  const [query, setQuery] = useState('');

  /** 기기에서 읽거나 선택 직후 갱신한 최근 장소 목록이다. 서버 검색 결과와 구분한다. */
  const [recent, setRecent] = useState<Place[]>([]);

  /** 일반 장소 탐색에서 상세 카드로 표시할 선택 장소다. */
  const [chosen, setChosen] = useState<Place | null>(null);

  /** 길찾기에서 편집 중인 출발 장소다. 요청이 확정되면 최신 위치 좌표를 반영한다. */
  const [start, setStart] = useState<Place | null>(null);

  /** 길찾기에서 편집 중인 도착 장소다. 양 끝점이 있어야 경로 요청을 확정한다. */
  const [end, setEnd] = useState<Place | null>(null);

  /** 현재 선택한 경로 검색 방식이다. 대중교통·버스·도보 요청 조건으로 사용한다. */
  const [mode, setMode] = useState<TravelMode>('transit');

  /** 좌표 확인이 끝나 Query 키로 전달할 확정 경로 요청이다. 편집 상태를 서버 결과로 복제한 값이 아니다. */
  const [request, setRequest] = useState<{ start: Place; end: Place; mode: TravelMode } | null>(
    null,
  );

  /** 상세 타임라인과 지도에 표시할 후보 경로의 ID다. null이면 경로 비교 목록을 표시한다. */
  const [selectedJourney, setSelectedJourney] = useState<string | null>(null);

  /** 경로 목록은 지도와 함께 드래그해 펼치거나 접는다. 네이티브 제스처의 정착 상태만 보관한다. */
  const [journeySnap, setJourneySnap] = useState<MapSheetSnap>('half');

  /** 실제 헤더 높이로 결과 시작 위치를 계산한다. 두 줄 편집과 한 줄 요약의 높이가 달라도 겹치지 않는다. */
  const [headerHeight, setHeaderHeight] = useState(136);

  /** 경로 요청 전에 현재 위치를 확인하고 있는지 표시한다. */
  const [positionBusy, setPositionBusy] = useState(false);

  /** 부모의 현재 좌표를 검색 결과와 같은 Place 형태로 만든 현재 위치 선택 항목이다. */
  const current: Place = {
    id: 'current',
    name: '현재 위치',
    address: '',
    category: '',
    distanceMeters: 0,
    ...position,
  };

  /** 첫 마운트에 기기의 최근 장소를 읽는다. 빈 의존성으로 한 번 실행하고 cleanup에서 alive를 내려 늦은 완료를 무시한다. */
  useEffect(() => {
    /** 언마운트 뒤 최근 장소 읽기가 완료되어도 상태를 갱신하지 않게 하는 effect 수명 플래그다. */

    let alive = true;
    void readPlaceHistory()
      .then((value) => {
        if (alive) setRecent(value);
      })
      .catch(() => console.warn('최근 장소 읽기 실패'));
    return () => {
      alive = false;
    };
  }, []);

  /** 입력 text가 바뀔 때마다 400ms 디바운스를 다시 예약한다. cleanup에서 이전 타이머를 해제해 마지막 입력만 Query에 반영한다. */
  useEffect(() => {
    /** 입력이 멈춘 뒤 400ms 후 검색어를 확정할 예약 핸들이다. 다음 입력 때 해제한다. */

    const timer = setTimeout(() => setQuery(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text]);

  /** 검색창 열림 또는 편집 field 변경 뒤 입력창에 포커스를 준다. 열린 화면의 즉시 명령이므로 해제할 구독은 없다. */
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open, field]);

  /** 빈 의존성으로 수명 정리만 등록한다. 언마운트 때 선택 세대를 올려 진행 중인 위치 조회 결과를 무효화한다. */
  useEffect(
    () => () => {
      selection.current++;
    },
    [],
  );

  /** 검색·길찾기·내 장소·선택 카드 표시가 바뀌면 부모에 지도 탐색 UI 활성 여부를 전달한다. 전달 콜백 변경도 의존성에 포함한다. */
  useEffect(() => {
    onPlanningChange?.(planning || open || savedOpen || Boolean(chosen));
  }, [planning, open, savedOpen, chosen, onPlanningChange]);

  /** 길찾기 모드와 양 끝점이 바뀌면 지도에 끝점 마커용 값을 전달한다. 모드를 벗어나면 null을 전달하며 별도 구독 해제는 없다. */
  useEffect(() => {
    onEndpoints?.(planning ? start : null, planning ? end : null);
  }, [planning, start, end, onEndpoints]);

  /** 매 렌더마다 최신 화면 상태를 읽는 뒤로가기 구독을 설치한다. cleanup에서 이전 구독을 제거해 중복 핸들러를 방지한다. */
  useEffect(() => {
    /** 현재 검색·시트 상태 순서로 뒤로가기를 처리하는 Android 이벤트 구독이다. */

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (savedOpen) {
        setSavedOpen(false);
        setOpen(savedFromSearch.current);
        return true;
      }
      if (open) {
        closeSearch();
        return true;
      }
      if (request && journeySnap === 'compact') {
        setJourneySnap('half');
        return true;
      }
      if (selectedJourney) {
        setSelectedJourney(null);
        onGeometry([]);
        return true;
      }
      if (request) {
        clearRoute();
        return true;
      }
      if (planning) {
        setPlanning(false);
        onPlace(null);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  });

  const { places, stations, results: searchResults } = usePlaceSearch(query, searchOrigin, open, !planning && !shortcutSlot);

  useEffect(() => {
    onSearchMap(mapResults && open && !planning ? { query, position: searchOrigin, filter: mapFilter } : null);
    return () => onSearchMap(null);
  }, [mapResults, mapFilter, open, planning, query, searchOrigin, onSearchMap]);

  const visibleSearchResults = searchResults.filter(place => matchesSearchFilter(place, mapFilter));
  const showMapFallback = open && mapResults && !planning && !suspended && visibleSearchResults.length === 0;
  const searchBusy = text.trim() !== query || places.isFetching || stations.isFetching;
  const searchError = places.isError ? message(places.error) : stations.isError ? message(stations.error) : '';

  /** 확정된 출발·도착·이동수단별 경로 Query 결과다. */
  const journeys = useQuery({
    queryKey: ['mobility', 'directions', request],
    queryFn: ({ signal }) => getDirections(request!.start, request!.end, request!.mode, signal),
    enabled: Boolean(request),
    staleTime: 60_000,
    retry: false,
  });

  /** 진행 중인 위치 조회를 무효화하고 경로 선택·지도 선·시트 높이를 함께 초기화한다. */
  function clearRoute() {
    selection.current++;
    setPositionBusy(false);
    setRequest(null);
    setSelectedJourney(null);
    setJourneySnap('half');
    onGeometry([]);
    onSheetHeight(0);
  }

  /** 새 입력은 이전 선택 작업을 취소하지만 집·회사 등록 대상은 유지한다. */
  function changeText(value: string) {
    selection.current++;
    setPositionBusy(false);
    if (mapResults) {
      if (suspended) onActivate();
      setMapResults(false);
      onPlace(null);
      onSheetHeight(0);
    }
    setText(value);
  }

  /** 일반 검색을 제출하면 키보드를 닫고 결과 전체를 지도에서 보여 준다. */
  function submitSearch() {
    const value = text.trim();
    setQuery(value);
    if (value.length < 2 || planning || shortcutSlot) return;
    Keyboard.dismiss();
    setMapFilter('all');
    setSearchSnap('half');
    setMapResults(true);
  }

  /** 검색을 닫으면 진행 중인 선택 완료와 집·회사 등록 의도를 함께 무효화한다. */
  function closeSearch() {
    selection.current++;
    setPositionBusy(false);
    setOpen(false);
    setMapResults(false);
    if (mapResults) onPlace(null);
    onSheetHeight(0);
    setShortcutSlot(null);
    Keyboard.dismiss();
  }

  /**
   * 검색 대상 필드를 바꾸고 기존 검색어를 지운다.
   * @param next 일반 장소·출발지·도착지 중 편집할 대상.
   */
  function edit(next: 'place' | 'start' | 'end') {
    selection.current++;
    setPositionBusy(false);
    setShortcutSlot(null);
    setMapResults(false);
    setSearchOrigin({ latitude: position.latitude, longitude: position.longitude });
    setField(next);
    setText('');
    setQuery('');
    setOpen(true);
    input.current?.focus();
  }

  /**
   * 현재 위치를 제외한 장소를 중복 없이 최신 순으로 저장한다.
   * @param place 사용자가 선택한 장소.
   */
  function remember(place: Place) {
    if (place.id === 'current') return;

    /** 같은 ID를 제거하고 선택 장소를 맨 앞에 둔 최대 10개의 최근 목록이다. */
    const next = [place, ...recent.filter((p) => p.id !== place.id)].slice(0, 10);
    setRecent(next);
    void savePlaceHistory(next).catch(() => console.warn('최근 장소 저장 실패'));
  }

  /**
   * 검색 결과를 현재 편집 필드에 적용하고 양 끝점이 있으면 경로를 조회한다.
   * @param place 선택 장소.
   */
  async function choose(place: Place, saveAs = shortcutSlot) {
    /** 저장 완료가 새로운 검색이나 다른 끝점 편집을 덮어쓰지 않도록 선택 당시 대상을 고정한다. */
    const revision = ++selection.current;
    const targetField = field;
    const selectedPlace =
      saveAs && place.id === 'current'
        ? { ...place, id: `shortcut:${saveAs}`, name: saveAs === 'home' ? '집' : '회사' }
        : place;
    if (saveAs) {
      try {
        await shortcuts.save(saveAs, selectedPlace);
      } catch {
        if (revision !== selection.current) return;
        Alert.alert('저장 실패', '집·회사 위치를 저장하지 못했습니다. 다시 시도해주세요.');
        return;
      }
    }
    if (revision !== selection.current) return;
    setShortcutSlot(null);
    place = selectedPlace;
    remember(place);
    Keyboard.dismiss();
    setText('');
    setQuery('');
    setOpen(false);
    setMapResults(false);
    onSheetHeight(0);
    if (targetField === 'start') {
      clearRoute();
      setStart(place);
      onPlace(place, false);
      if (end) void searchJourney(place, end);
    } else if (targetField === 'end') {
      clearRoute();
      setEnd(place);
      onPlace(place, false);
      if (start) void searchJourney(start, place);
    } else {
      setChosen(place);
      onPlace(place, true);
    }
  }

  /**
   * 현재 위치를 출발점으로 길찾기를 시작한다.
   * @param place 도착 장소. 생략하면 기존 선택 장소를 사용한다.
   */
  function beginPlanning(place?: Place) {
    onActivate();
    clearRoute();
    setPlanning(true);
    setStart(current);
    setEnd(place ?? chosen);
    setChosen(null);
    setOpen(!(place || chosen));
    setField('end');
    setText('');
    if (place || chosen) void searchJourney(current, place ?? chosen);
  }

  /**
   * 선택한 경로 ID와 지도 선을 일치시킨다.
   * @param journey 사용자가 선택한 서버 경로.
   */
  function selectJourney(journey: Journey) {
    setSelectedJourney(journey.id);
    onGeometry(journey.geometry);
  }

  /**
   * 현재 위치가 포함되면 좌표를 새로 확인한 뒤 Query 요청 조건을 확정한다. 세대가 바뀐 결과는 버린다.
   * @param startPlace 출발 장소. 기본값은 편집 중인 출발지.
   * @param endPlace 도착 장소. 기본값은 편집 중인 도착지.
   * @param nextMode 조회할 이동수단.
   * @returns 좌표 확인 및 요청 상태 반영이 끝나는 Promise.
   */
  async function searchJourney(startPlace = start, endPlace = end, nextMode = mode) {
    if (!startPlace || !endPlace) return;
    clearRoute();
    Keyboard.dismiss();

    /** 위치 조회를 시작한 당시의 선택 세대다. 완료 시 현재 세대와 달라졌으면 결과를 버린다. */
    const revision = selection.current;
    setPositionBusy(true);
    try {
      /** 양 끝점 중 현재 위치가 있을 때 새로 확인한 좌표다. 고정 장소끼리의 경로에는 조회하지 않는다. */
      const fresh =
        startPlace.id === 'current' || endPlace.id === 'current' ? await getPosition() : null;
      if (
        revision !== selection.current ||
        (!fresh && (startPlace.id === 'current' || endPlace.id === 'current'))
      )
        return;

      /** 현재 위치 출발점에만 새 좌표를 적용한 최종 요청 출발지다. */
      const nextStart = startPlace.id === 'current' ? { ...startPlace, ...fresh! } : startPlace;

      /** 현재 위치 도착점에만 새 좌표를 적용한 최종 요청 도착지다. */
      const nextEnd = endPlace.id === 'current' ? { ...endPlace, ...fresh! } : endPlace;
      setStart(nextStart);
      setEnd(nextEnd);
      setRequest({ start: nextStart, end: nextEnd, mode: nextMode });
    } finally {
      if (revision === selection.current) setPositionBusy(false);
    }
  }

  return (
    <>
      {planning ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: top,
            backgroundColor: colors.surface,
          }}
        />
      ) : null}
      {(open && !mapResults) || showMapFallback || (planning && (!request || journeySnap === 'full')) ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.background,
          }}
        />
      ) : null}
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          top,
          left: planning ? 0 : left,
          right: planning ? 0 : 16,
          gap: 12,
        }}
      >
        {planning ? (
          <RouteEditor
            start={start}
            end={end}
            mode={mode}
            hasRequest={Boolean(request)}
            positionBusy={positionBusy}
            editingField={open && field !== 'place' ? field : undefined}
            text={text}
            inputRef={input}
            onText={changeText}
            onSubmit={() => setQuery(text.trim())}
            duration={
              journeys.data?.paths.length
                ? Math.min(...journeys.data.paths.map((path) => path.minutes))
                : undefined
            }
            edit={edit}
            onSwap={() => {
              clearRoute();
              setStart(end);
              setEnd(start);
              if (start && end) void searchJourney(end, start);
            }}
            onClose={() => {
              clearRoute();
              setPlanning(false);
              setShortcutSlot(null);
              setOpen(false);
              setText('');
              setQuery('');
              Keyboard.dismiss();
              onPlace(null);
            }}
            onMode={(value) => {
              if (value === mode) return;
              clearRoute();
              setMode(value);
              if (start && end) void searchJourney(start, end, value);
            }}
          />
        ) : null}
        {!planning ? (
          <MobilitySearchBar open={open} value={text} inputRef={input}
            placeholder={shortcutSlot ? `${shortcutSlot === 'home' ? '집' : '회사'} 위치 검색` : '정류장 이름·번호, 지하철역 검색'}
            onOpen={() => { onActivate(); edit('place'); }} onClose={closeSearch}
            onText={changeText} onSubmit={submitSearch}
            onSaved={() => { onActivate(); savedFromSearch.current = open; setOpen(false); Keyboard.dismiss(); setSavedOpen(true); }}
            onDirections={() => beginPlanning()} />
        ) : null}
      </View>
      {open && !mapResults && !suspended ? (
        <PlaceSearchResults
          top={top + headerHeight}
          planning={planning}
          query={query}
          recent={recent}
          places={text.trim() === query ? searchResults : undefined}
          fetching={text.trim() !== query || places.isFetching || stations.isFetching}
          shortcuts={shortcuts.shortcuts}
          shortcutBusy={shortcuts.busy}
          onShortcut={(slot) => {
            if (shortcuts.shortcuts[slot]) void choose(shortcuts.shortcuts[slot]!, null);
            else {
              selection.current++;
              setShortcutSlot(slot);
              setText('');
              setQuery('');
              input.current?.focus();
            }
          }}
          onSaved={() => {
            selection.current++;
            savedFromSearch.current = true;
            setOpen(false);
            Keyboard.dismiss();
            setSavedOpen(true);
          }}
          error={
            shortcuts.error ||
            (places.isError
              ? message(places.error)
              : stations.isError
                ? message(stations.error)
                : '')
          }
          onCurrent={() => choose(current)}
          onChoose={place => {
            if (planning || shortcutSlot || query.length < 2) { void choose(place); return; }
            Keyboard.dismiss();
            remember(place);
            setMapResults(true);
            onSearchSelect(place);
          }}
          transitOnly={!planning && !shortcutSlot}
          onMap={!planning && !shortcutSlot && text.trim() === query && query.length >= 2 ? (filter) => {
            setMapFilter(filter);
            Keyboard.dismiss();
            setSearchSnap('half');
            setMapResults(true);
          } : undefined}
          onClearHistory={() => {
            setRecent([]);
            void savePlaceHistory([]).catch(() => console.warn('최근 장소 삭제 실패'));
          }}
        />
      ) : null}
      {showMapFallback ? (
        <View style={{ position: 'absolute', top: top + headerHeight, left: 0, right: 0, bottom: 0,
          alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 12 }}>
          {searchBusy ? <ActivityIndicator color={colors.accent} /> : null}
          <Text accessibilityRole={searchError ? 'alert' : 'text'} style={{ color: colors.secondaryText, fontSize: 16, paddingHorizontal: 24, textAlign: 'center' }}>
            {searchBusy ? '검색 중입니다.' : searchError || '검색 결과가 없습니다.'}
          </Text>
        </View>
      ) : null}
      {open && mapResults && !planning && !suspended && !showMapFallback ? (
        <MapBottomSheet snap={searchSnap} onChangeSnap={setSearchSnap}
          topInset={top + headerHeight} onHeightChange={onSheetHeight}>
          <MapSearchResults query={query} places={visibleSearchResults} selectedId={selectedSearchId}
            onSelect={onSearchSelect} onChoose={onSearchSelect}
            onClose={() => { setMapResults(false); onPlace(null); onSheetHeight(0); }} />
        </MapBottomSheet>
      ) : null}
      {!suspended && !open && chosen && !planning ? (
        <PlaceDetail
          place={chosen}
          onSheetHeight={onSheetHeight}
          onClose={() => {
            setChosen(null);
            onPlace(null);
            onSheetHeight(0);
          }}
          onStart={() => {
            /** 선택 장소 상세를 닫기 전에 출발점으로 사용할 장소를 캡처한다. */

            const place = chosen;
            onActivate();
            clearRoute();
            setPlanning(true);
            setChosen(null);
            setStart(place);
            setEnd(null);
            setField('end');
            setOpen(true);
          }}
          onEnd={() => beginPlanning(chosen)}
          onSubway={() => {
            onSubway(chosen.name, chosen.subwayLineName);
            setChosen(null);
          }}
        />
      ) : null}
      {!suspended && !open && planning && request ? (
        <MapBottomSheet
          edgeToEdge
          snap={journeySnap}
          topInset={top + headerHeight}
          onChangeSnap={(next) => {
            setJourneySnap(next);
          }}
          onHeightChange={onSheetHeight}
        >
          <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {journeys.isFetching ? (
              <ActivityIndicator style={{ margin: 24 }} color={colors.accent} />
            ) : null}
            {journeys.isError ? (
              <View style={{ padding: 20, gap: 12 }}>
                <Text style={{ color: colors.danger }}>{message(journeys.error)}</Text>
                <AppButton
                  title="다시 시도"
                  variant="secondary"
                  onPress={() => void journeys.refetch()}
                />
              </View>
            ) : null}
            {!journeys.isFetching && !journeys.isError && journeys.data?.paths.length === 0 ? (
              <Text style={{ color: colors.secondaryText, padding: 20 }}>
                이 구간에서 이용할 수 있는 경로가 없습니다.
              </Text>
            ) : null}
            {journeys.data ? (
              <JourneyResults
                key={`${request.start.latitude}:${request.start.longitude}:${request.end.latitude}:${request.end.longitude}:${request.mode}:${journeys.dataUpdatedAt}`}
                paths={journeys.data.paths}
                selectedId={selectedJourney}
                startName={request.start.name}
                endName={request.end.name}
                onSelect={selectJourney}
                onBack={() => {
                  setSelectedJourney(null);
                  onGeometry([]);
                }}
                onGeometry={(lines) => {
                  onGeometry(lines);
                  setJourneySnap('compact');
                }}
                onSubway={onSubway}
              />
            ) : null}
            {journeys.data ? (
              <Text style={{ color: colors.secondaryText, fontSize: 11, padding: 20 }}>
                {journeys.data.attribution}
              </Text>
            ) : null}
          </BottomSheetScrollView>
        </MapBottomSheet>
      ) : null}
      {savedOpen && !suspended ? (
        <SavedPlaces
          top={top}
          places={recent}
          onClose={() => {
            setSavedOpen(false);
            setOpen(savedFromSearch.current);
          }}
          onPlace={(place) => {
            setSavedOpen(false);
            void choose(place);
          }}
          onSubway={(station, line) => {
            setSavedOpen(false);
            onSubway(station, line);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * 서버가 제공한 오류 문구를 우선하고 화면별 기본 안내로 보완한다.
 * @param error 잡힌 요청 오류.
 * @returns 사용자에게 표시할 문구.
 */
function message(error: unknown) {
  if (isAxiosError(error) && error.response?.status === 404)
    return '검색·길찾기 서비스가 아직 연결되지 않았습니다.';

  /** Axios 오류 응답에 포함된 사용자 안내 문구 후보로, 문자열일 때만 표시한다. */
  const value = isAxiosError(error) ? error.response?.data?.message : undefined;
  return typeof value === 'string'
    ? value
    : '정보를 불러오지 못했습니다. 연결 상태를 확인해주세요.';
}
