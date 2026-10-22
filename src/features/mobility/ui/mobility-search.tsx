/** @fileoverview 지도 장소 검색과 알림 대상 선택을 연결한다. 서버 결과는 Query, 검색 UI는 로컬 상태가 소유한다. */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Text, TextInput, View } from 'react-native';
import { isAxiosError } from 'axios';
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { mapUi } from '@/shared/ui/map-design-tokens';
import type { Place, Point } from '../api/mobility';
import { PlaceDetail } from './place-detail';
import { PlaceSearchResults } from './place-search-results';
import { usePlaceSearch, type SearchMapRequest } from '../model/use-place-search';
import { matchesSearchFilter, type SearchResultFilter } from '../model/place-kind';
import { MobilitySearchBar } from './mobility-search-bar';
import { MapSearchResults } from './map-search-results';
import { readPlaceHistory, savePlaceHistory } from '../model/search-history';

type Props = {
  position: Point;
  top: number;
  left?: number;
  alertTransport?: 'bus' | 'subway';
  onPlace: (place: Place | null, showBusStop?: boolean) => void;
  onActivate: () => void;
  onSheetHeight: (height: number) => void;
  onSubway: (stationName: string, lineName?: string) => void;
  onSearchActiveChange?: (active: boolean) => void;
  suspended?: boolean;
  onSearchMap: (request: SearchMapRequest | null) => void;
  selectedSearchId: string | null;
  onSearchSelect: (place: Place) => void;
};

/** 알림 검색은 현재 교통수단으로 한정하고 선택 즉시 기존 알림 지도 패널로 연결한다. */
export function MobilitySearch({
  position,
  top,
  left = 16,
  alertTransport,
  onPlace,
  onActivate,
  onSheetHeight,
  onSubway,
  onSearchActiveChange,
  suspended = false,
  onSearchMap,
  selectedSearchId,
  onSearchSelect,
}: Props) {
  const input = useRef<TextInput>(null);
  const [requestedOpen, setOpen] = useState(false);
  // 지도에서 직접 대상을 누른 경우에도 검색을 접고 알림 선택 패널을 복원한다.
  const open = requestedOpen && (!alertTransport || !suspended);
  const [mapResults, setMapResults] = useState(false);
  const [searchOrigin, setSearchOrigin] = useState<Point>(position);
  const [mapFilter, setMapFilter] = useState<SearchResultFilter>('all');
  const [searchSnap, setSearchSnap] = useState<MapSheetSnap>('half');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Place[]>([]);
  const [chosen, setChosen] = useState<Place | null>(null);
  const [headerHeight, setHeaderHeight] = useState(50);
  const fixedFilter =
    alertTransport === 'bus' ? 'stop' : alertTransport === 'subway' ? 'subway' : undefined;
  const activeFilter = fixedFilter ?? mapFilter;

  useEffect(() => {
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
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 400);
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  useEffect(() => {
    onSearchActiveChange?.(open);
  }, [open, onSearchActiveChange]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open) {
        closeSearch();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  });

  const { places, stations, results } = usePlaceSearch(query, searchOrigin, open);
  const searchResults = fixedFilter
    ? results.filter((place) => matchesSearchFilter(place, fixedFilter))
    : results;
  useEffect(() => {
    onSearchMap(
      mapResults && open ? { query, position: searchOrigin, filter: activeFilter } : null,
    );
    return () => onSearchMap(null);
  }, [mapResults, open, query, searchOrigin, activeFilter, onSearchMap]);
  const visibleSearchResults = searchResults.filter((place) =>
    matchesSearchFilter(place, activeFilter),
  );
  const showMapFallback = open && mapResults && !suspended && visibleSearchResults.length === 0;
  const searchBusy = text.trim() !== query || places.isFetching || stations.isFetching;
  const searchError = places.isError
    ? message(places.error)
    : stations.isError
      ? message(stations.error)
      : '';

  function changeText(value: string) {
    if (mapResults) {
      if (suspended) onActivate();
      setMapResults(false);
      onPlace(null);
      onSheetHeight(0);
    }
    setText(value);
  }
  function submitSearch() {
    const value = text.trim();
    setQuery(value);
    if (value.length < 2) return;
    Keyboard.dismiss();
    setMapFilter('all');
    setSearchSnap('half');
    setMapResults(true);
  }
  function closeSearch() {
    setOpen(false);
    setMapResults(false);
    if (mapResults) onPlace(null);
    onSheetHeight(0);
    Keyboard.dismiss();
  }
  function edit() {
    setMapResults(false);
    setChosen(null);
    setSearchOrigin({ latitude: position.latitude, longitude: position.longitude });
    setText('');
    setQuery('');
    setOpen(true);
  }
  function remember(place: Place) {
    const next = [place, ...recent.filter((item) => item.id !== place.id)].slice(0, 10);
    setRecent(next);
    void savePlaceHistory(next).catch(() => console.warn('최근 장소 저장 실패'));
  }
  function selectResult(place: Place) {
    remember(place);
    Keyboard.dismiss();
    if (alertTransport) {
      setOpen(false);
      setMapResults(false);
      setChosen(null);
      onSheetHeight(0);
    }
    onSearchSelect(place);
  }
  function choose(place: Place) {
    if (alertTransport) {
      selectResult(place);
      return;
    }
    remember(place);
    Keyboard.dismiss();
    setText('');
    setQuery('');
    setOpen(false);
    setMapResults(false);
    onSheetHeight(0);
    setChosen(place);
    onPlace(place, true);
  }
  return (
    <>
      {(open && !mapResults) || showMapFallback ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: mapUi.background }} />
      ) : null}
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{ position: 'absolute', top, left, right: 16 }}
      >
        <MobilitySearchBar
          open={open}
          value={text}
          inputRef={input}
          placeholder={
            alertTransport === 'bus'
              ? '정류장 이름·번호 검색'
              : alertTransport === 'subway'
                ? '지하철역 검색'
                : '정류장 이름·번호, 지하철역 검색'
          }
          onOpen={() => {
            onActivate();
            edit();
          }}
          onClose={closeSearch}
          onText={changeText}
          onSubmit={submitSearch}
        />
      </View>
      {open && !mapResults && !suspended ? (
        <PlaceSearchResults
          top={top + headerHeight}
          query={query}
          recent={recent}
          fixedFilter={fixedFilter}
          places={text.trim() === query ? searchResults : undefined}
          fetching={searchBusy}
          error={searchError}
          onChoose={(place) => {
            if (alertTransport) {
              selectResult(place);
              return;
            }
            if (query.length < 2) {
              choose(place);
              return;
            }
            setMapResults(true);
            selectResult(place);
          }}
          transitOnly
          onMap={
            text.trim() === query && query.length >= 2
              ? (filter) => {
                  setMapFilter(filter);
                  Keyboard.dismiss();
                  setSearchSnap('half');
                  setMapResults(true);
                }
              : undefined
          }
          onClearHistory={() => {
            setRecent([]);
            void savePlaceHistory([]).catch(() => console.warn('최근 장소 삭제 실패'));
          }}
        />
      ) : null}
      {showMapFallback ? (
        <View
          style={{
            position: 'absolute',
            top: top + headerHeight,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: mapUi.background,
            gap: 12,
          }}
        >
          {searchBusy ? <ActivityIndicator color={mapUi.blue} /> : null}
          <Text
            accessibilityRole={searchError ? 'alert' : 'text'}
            style={{
              color: mapUi.secondaryText,
              fontSize: 16,
              paddingHorizontal: 24,
              textAlign: 'center',
            }}
          >
            {searchBusy ? '검색 중입니다.' : searchError || '검색 결과가 없습니다.'}
          </Text>
        </View>
      ) : null}
      {open && mapResults && !suspended && !showMapFallback ? (
        <MapBottomSheet
          snap={searchSnap}
          onChangeSnap={setSearchSnap}
          topInset={top + headerHeight}
          onHeightChange={onSheetHeight}
        >
          <MapSearchResults
            query={query}
            places={visibleSearchResults}
            selectedId={selectedSearchId}
            onSelect={selectResult}
            onChoose={selectResult}
            onClose={() => {
              setMapResults(false);
              onPlace(null);
              onSheetHeight(0);
            }}
          />
        </MapBottomSheet>
      ) : null}
      {!alertTransport && !suspended && !open && chosen ? (
        <PlaceDetail
          place={chosen}
          onSheetHeight={onSheetHeight}
          onClose={() => {
            setChosen(null);
            onPlace(null);
            onSheetHeight(0);
          }}
          onSubway={() => {
            onSubway(chosen.name, chosen.subwayLineName);
            setChosen(null);
          }}
        />
      ) : null}
    </>
  );
}

/** 서버의 사용자용 오류를 우선해 검색 실패 이유를 보존한다. */
function message(error: unknown) {
  if (isAxiosError(error) && error.response?.status === 404)
    return '검색 서비스가 아직 연결되지 않았습니다.';
  const value = isAxiosError(error) ? error.response?.data?.message : undefined;
  return typeof value === 'string'
    ? value
    : '정보를 불러오지 못했습니다. 연결 상태를 확인해주세요.';
}
