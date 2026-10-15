/** @fileoverview 지도 위 장소 검색·출발/도착 편집·경로 선택 흐름을 연결한다. 서버 결과는 Query, 편집 중 UI는 로컬 상태가 소유한다. */

import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { SymbolView } from 'expo-symbols';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AppButton, useAppTheme } from '@/shared/ui';
import {
  getDirections,
  searchPlaces,
  type Journey,
  type Place,
  type Point,
  type TravelMode,
} from '../api/mobility';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { RouteEditor } from './route-editor';
import { PlaceDetail } from './place-detail';
import { PlaceSearchResults } from './place-search-results';
import { HOME_CATEGORIES } from './search-categories';
import { SavedPlaces } from './saved-places';
import { JourneyResults } from './journey-results';
import { usePlaceShortcuts } from '../model/use-place-shortcuts';
import { searchBusStops } from '@/features/bus-stop/api/search-bus-stops';
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
  routeIntent?: { id: number; place: Place; field: 'start' | 'end' } | null;
  suspended?: boolean;
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
  routeIntent,
  suspended = false,
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

  /** 마지막 외부 요청 ID를 기억해 effect 재실행으로 같은 출발·도착 의도를 두 번 적용하지 않는다. */
  const handledIntent = useRef<number | null>(null);

  /** 집·회사로 지정한 사용자 장소와 기기 저장 상태다. */
  const shortcuts = usePlaceShortcuts();

  /** 집·회사 등록을 위해 다음 검색 결과를 저장할 슬롯이다. */
  const [shortcutSlot, setShortcutSlot] = useState<'home' | 'work' | null>(null);

  /** 검색 입력과 결과 목록의 열림 여부다. 검색 모드에서는 지도 위 전체 검색 영역을 표시한다. */
  const [open, setOpen] = useState(false);

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

  /** 입력 text가 바뀔 때마다 300ms 디바운스를 다시 예약한다. cleanup에서 이전 타이머를 해제해 마지막 입력만 Query에 반영한다. */
  useEffect(() => {
    /** 입력이 멈춘 뒤 300ms 후 검색어를 확정할 예약 핸들이다. 다음 입력 때 해제한다. */

    const timer = setTimeout(() => setQuery(text.trim()), 300);
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

  /** 외부 경로 요청을 최신 편집 상태로 적용한다. Effect Event이므로 요청 감지 effect를 로컬 상태마다 다시 예약하지 않는다. */
  const handleRouteIntent = useEffectEvent(() => {
    if (!routeIntent || handledIntent.current === routeIntent.id) return;
    handledIntent.current = routeIntent.id;
    onActivate();
    clearRoute();
    setPlanning(true);
    setChosen(null);
    setText('');
    setQuery('');
    if (routeIntent.field === 'end') {
      setStart(current);
      setEnd(routeIntent.place);
      setOpen(false);
      void searchJourney(current, routeIntent.place);
    } else {
      setStart(routeIntent.place);
      setEnd(null);
      setField('end');
      setOpen(true);
    }
  });

  // 역 시트가 닫힌 다음 프레임에 외부 출발·도착 요청을 적용한다.
  /** 외부 routeIntent가 바뀌면 역 시트가 닫힌 다음 프레임에 요청을 적용한다. 최신 편집 상태는 Effect Event가 읽고 cleanup은 예약 프레임을 취소한다. */
  useEffect(() => {
    if (!routeIntent) return;

    /** 역 시트가 닫힌 다음 프레임에 외부 경로 요청을 적용할 예약 핸들이다. */
    const frame = requestAnimationFrame(() => handleRouteIntent());
    return () => cancelAnimationFrame(frame);
  }, [routeIntent]);

  /** 검색창이 열리고 검색어가 두 글자 이상일 때 실행하는 주변 장소 Query 결과다. */
  const places = useQuery({
    queryKey: ['mobility', 'places', query, position.latitude, position.longitude],
    queryFn: ({ signal }) => searchPlaces(query, position, signal),
    enabled: open && query.length >= 2,
    staleTime: 60_000,
    retry: false,
  });

  /** 정류장은 서버 DB에서 별도 조회해 장소 공급자에 누락된 정류장도 검색할 수 있게 한다. */
  const stations = useQuery({
    queryKey: ['bus-stops', 'search', query, position.latitude, position.longitude],
    queryFn: ({ signal }) => searchBusStops(query, position, signal),
    enabled: open && query.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });

  /** 정류장 응답을 선택 화면의 공통 장소 계약으로 투영한다. 원본 Query 데이터를 다른 상태에 복제하지 않는다. */
  const searchResults: Place[] = [
    ...(stations.data ?? []).map((stop) => ({
      id: `station:${stop.id}`,
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.arsIds?.join(', ') || stop.arsId || '',
      category: '버스정류장',
      distanceMeters: stop.distanceMeters,
    })),
    ...(places.data ?? []),
  ];

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
    setText(value);
  }

  /** 검색을 닫으면 진행 중인 선택 완료와 집·회사 등록 의도를 함께 무효화한다. */
  function closeSearch() {
    selection.current++;
    setPositionBusy(false);
    setOpen(false);
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
    setField(next);
    setText('');
    setQuery('');
    setOpen(true);
    input.current?.focus();
  }

  /**
   * 홈 카테고리를 일반 장소 검색으로 적용한다.
   * @param name 검색할 카테고리 이름.
   */
  function searchCategory(name: string) {
    selection.current++;
    setShortcutSlot(null);
    onActivate();
    setField('place');
    setText(name);
    setQuery(name);
    setOpen(true);
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
      {open || (planning && (!request || journeySnap === 'full')) ? (
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
          left: open || planning ? 0 : left,
          right: open || planning ? 0 : 16,
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
        {open && !planning ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderBottomWidth: 0.5,
              borderColor: colors.separator,
              minHeight: 54,
            }}
          >
            <Pressable accessibilityLabel="검색 뒤로" onPress={closeSearch} style={{ padding: 12 }}>
              <SymbolView
                name={{ ios: 'chevron.left', android: 'arrow_back' }}
                size={22}
                tintColor={colors.text}
              />
            </Pressable>
            <TextInput
              ref={input}
              value={text}
              maxLength={100}
              onChangeText={changeText}
              placeholder={
                planning
                  ? `${field === 'start' ? '출발지' : '도착지'} 검색`
                  : shortcutSlot
                    ? `${shortcutSlot === 'home' ? '집' : '회사'} 위치 검색`
                    : '장소, 버스, 지하철, 주소 검색'
              }
              placeholderTextColor={colors.secondaryText}
              style={{ flex: 1, color: colors.text, fontSize: 17, paddingVertical: 12 }}
              returnKeyType="search"
              onSubmitEditing={() => setQuery(text.trim())}
            />
            {text ? (
              <Pressable
                accessibilityLabel="검색어 지우기"
                onPress={() => {
                  changeText('');
                  setQuery('');
                }}
                style={{ padding: 12 }}
              >
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'cancel' }}
                  size={20}
                  tintColor={colors.tertiaryText}
                />
              </Pressable>
            ) : null}
          </View>
        ) : !planning ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View
                style={{
                  flex: 1,
                  height: 50,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 28,
                  backgroundColor: colors.surface,
                  paddingLeft: 16,
                  paddingRight: 12,
                  boxShadow: '0 2px 6px #00000024',
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="장소 검색"
                  onPress={() => {
                    onActivate();
                    edit('place');
                  }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    height: 50,
                  }}
                >
                  <View
                    style={{
                      width: 26,
                      height: 31,
                      borderRadius: 14,
                      borderBottomRightRadius: 4,
                      backgroundColor: colors.accent,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 20, color: colors.onAccent, fontWeight: '800' }}>
                      T
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 17, color: '#44474A', flex: 1 }}>
                    타라고 검색
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="내 장소"
                  onPress={() => {
                    onActivate();
                    savedFromSearch.current = false;
                    setSavedOpen(true);
                  }}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: '#DBEEEA',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SymbolView
                    name={{ ios: 'person.fill', android: 'person' }}
                    size={23}
                    tintColor="#559C8A"
                  />
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="길찾기"
                onPress={() => beginPlanning()}
                style={{
                  height: 50,
                  width: 50,
                  borderRadius: 25,
                  backgroundColor: colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 6px #00000024',
                }}
              >
                <SymbolView
                  name={{ ios: 'arrow.turn.up.right', android: 'turn_right' }}
                  size={28}
                  tintColor={colors.onAccent}
                />
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingBottom: 6 }}
            >
              {HOME_CATEGORIES.map((category) => (
                <Pressable
                  key={category.label}
                  accessibilityRole="button"
                  onPress={() => searchCategory(category.label)}
                  style={{
                    flexDirection: 'row',
                    gap: 7,
                    alignItems: 'center',
                    height: 34,
                    paddingHorizontal: 13,
                    borderRadius: 18,
                    backgroundColor: colors.surface,
                    boxShadow: '0 2px 4px #00000020',
                  }}
                >
                  <SymbolView name={category.symbol} size={17} tintColor={category.color} />
                  <Text style={{ color: colors.text, fontSize: 14 }}>{category.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}
      </View>
      {open ? (
        <PlaceSearchResults
          top={top + headerHeight}
          planning={planning}
          query={query}
          recent={recent}
          places={searchResults}
          fetching={places.isFetching || stations.isFetching}
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
          onChoose={choose}
          onCategory={searchCategory}
          onClearHistory={() => {
            setRecent([]);
            void savePlaceHistory([]).catch(() => console.warn('최근 장소 삭제 실패'));
          }}
        />
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
            onSubway(chosen.name);
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
