/** @fileoverview 지도 장소 검색과 알림 대상 선택을 연결한다. 서버 결과는 Query, 검색 UI는 로컬 상태가 소유한다. */
import { MapBottomSheet, type MapSheetSnap } from '@/shared/ui/map-bottom-sheet';
import { mapUi } from '@/shared/ui/map-design-tokens';
import { isAxiosError } from 'axios';
import { useEffect, useRef, useState } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { ActivityIndicator, BackHandler, Keyboard, Text, TextInput, View } from 'react-native';
import type { Place, Point } from '../api/mobility';
import { matchesSearchFilter, type SearchResultFilter } from '../model/place-kind';
import { readPlaceHistory, savePlaceHistory } from '../model/search-history';
import { usePlaceSearch, type SearchMapRequest } from '../model/use-place-search';
import { MapSearchResults, MapSearchResultsHeader } from './map-search-results';
import { MobilitySearchBar } from './mobility-search-bar';
import { PlaceDetail } from './place-detail';
import { PlaceSearchResults } from './place-search-results';

type Props = {
  position: Point;
  top: number;
  left?: number;
  alertTransport?: 'bus' | 'subway';
  onPlace: (place: Place | null, showBusStop?: boolean) => void;
  onActivate: () => void;
  onSheetHeight: (height: number) => void;
  animatedPosition?: SharedValue<number>;
  onSubway: (stationName: string, lineName?: string) => void;
  onSearchActiveChange?: (active: boolean) => void;
  suspended?: boolean;
  onSearchMap: (request: SearchMapRequest | null) => void;
  selectedSearchId: string | null;
  selectedPlace: Place | null;
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
  animatedPosition,
  onSubway,
  onSearchActiveChange,
  suspended = false,
  onSearchMap,
  selectedSearchId,
  selectedPlace,
  onSearchSelect,
}: Props) {
  const input = useRef<TextInput>(null);
  const [requestedOpen, setOpen] = useState(false);
  // 지도에서 직접 대상을 누른 경우에도 검색을 접고 알림 선택 패널을 복원한다.
  const open = requestedOpen && (!alertTransport || !suspended);
  const [mapResults, setMapResults] = useState(false);
  const [searchOrigin, setSearchOrigin] = useState<Point>(position);
  const [mapFilter, setMapFilter] = useState<SearchResultFilter>('all');
  const [searchSnap, setSearchSnap] = useState<MapSheetSnap>('compact');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<Place[]>([]);
  const placeDetail =
    selectedPlace &&
    !selectedPlace.id.startsWith('station:') &&
    !selectedPlace.id.startsWith('subway:')
      ? selectedPlace
      : null;
  const [previousSuspended, setPreviousSuspended] = useState(suspended);
  if (suspended !== previousSuspended) {
    setPreviousSuspended(suspended);
    if (suspended) {
      setText('');
      setQuery('');
      setOpen(false);
      setMapResults(false);
    }
  }
  const [headerHeight, setHeaderHeight] = useState(50);
  const activeFilter = mapFilter;

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

  /** 지도 마커에서 직접 정류소·역을 열어도 검색 목록과 포인터를 남기지 않는다. */
  useEffect(() => {
    if (!suspended) return;
    onSearchMap(null);
    Keyboard.dismiss();
  }, [suspended, onSearchMap]);

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

  const { places, subways, stations, results } = usePlaceSearch(query, searchOrigin, open, false);
  const searchResults = results;
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
  const searchBusy =
    text.trim() !== query || places.isFetching || subways.isFetching || stations.isFetching;
  const searchError = places.isError
    ? message(places.error)
    : stations.isError
      ? message(stations.error)
      : subways.isError
        ? message(subways.error)
        : '';

  function changeText(value: string) {
    if (!value.trim()) {
      setQuery('');
      onSearchMap(null);
    }
    if (mapResults) {
      onActivate();
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
    setSearchSnap('compact');
    setMapResults(true);
  }
  function closeSearch() {
    setText('');
    setQuery('');
    setMapFilter('all');
    onSearchMap(null);
    onActivate();
    setOpen(false);
    setMapResults(false);
    onPlace(null);
    onSheetHeight(0);
    Keyboard.dismiss();
  }
  function edit() {
    setMapResults(false);
    onSearchMap(null);
    onSheetHeight(0);
    if (!mapResults) {
      setSearchOrigin({ latitude: position.latitude, longitude: position.longitude });
      setText('');
      setQuery('');
    }
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
    if (alertTransport || place.id.startsWith('station:') || place.id.startsWith('subway:')) {
      setText('');
      setQuery('');
      setOpen(false);
      setMapResults(false);
      onSearchMap(null);
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
    onPlace(place, true);
  }
  return (
    <>
      {(open && !mapResults) || showMapFallback ? (
        <View
          onTouchStart={() => Keyboard.dismiss()}
          style={{ position: 'absolute', inset: 0, backgroundColor: mapUi.background }}
        />
      ) : null}
      <View
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={{ position: 'absolute', top, left, right: 16 }}
      >
        <MobilitySearchBar
          open={open}
          resultsVisible={mapResults}
          value={text}
          inputRef={input}
          placeholder="장소·주소·정류장·지하철역 검색"
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
          onClearHistory={() => {
            setRecent([]);
            void savePlaceHistory([]).catch(() => console.warn('최근 장소 삭제 실패'));
          }}
        />
      ) : null}
      {showMapFallback ? (
        <View
          onTouchStart={() => Keyboard.dismiss()}
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
          toolbar={
            <MapSearchResultsHeader
              query={query}
              count={visibleSearchResults.length}
              onClose={() => {
                setMapResults(false);
                onPlace(null);
                onSheetHeight(0);
              }}
            />
          }
          snap={searchSnap}
          onChangeSnap={setSearchSnap}
          topInset={top + headerHeight}
          onHeightChange={onSheetHeight}
          animatedPosition={animatedPosition}
        >
          <MapSearchResults
            places={visibleSearchResults}
            selectedId={selectedSearchId}
            onSelect={selectResult}
            onChoose={selectResult}
          />
        </MapBottomSheet>
      ) : null}
      {!alertTransport && !open && placeDetail ? (
        <PlaceDetail
          place={placeDetail}
          onSheetHeight={onSheetHeight}
          onClose={() => {
            onPlace(null);
            onSheetHeight(0);
          }}
          onSubway={() => {
            onSubway(placeDetail.name, placeDetail.subwayLineName);
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
