/** @fileoverview 기기에 저장한 지하철역과 부모가 제공한 최근 장소를 보여주고 선택을 지도에 전달한다. */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { readSavedSubwayStations } from '@/features/subway/model/use-saved-subway-station';
import { mapUi } from '@/shared/ui/map-design-tokens';
import type { Place } from '../api/mobility';

/**
 * 저장한 역은 기기에서 읽고 최근 장소는 부모의 현재 목록을 표시한다.
 * @param props 상단 여백·최근 장소와 닫기/장소/역 선택 콜백.
 * @returns 내 장소 화면. 작은 목록은 그대로 렌더링하며 선택 콜백을 별도로 메모화하지 않는다.
 */
export function SavedPlaces({
  top,
  places,
  onClose,
  onPlace,
  onSubway,
}: {
  top: number;
  places: Place[];
  onClose: () => void;
  onPlace: (place: Place) => void;
  onSubway: (station: string, line?: string) => void;
}) {
  /** 이 화면을 열 때 기기 저장소에서 읽은 즐겨찾기 역·노선 목록이다. */
  const [stations, setStations] = useState<Awaited<ReturnType<typeof readSavedSubwayStations>>>([]);

  /** 저장한 역 조회가 실패했을 때 목록 위치에 표시할 안내 문구다. */
  const [error, setError] = useState('');

  /** 첫 마운트에 저장한 역을 읽는다. 빈 의존성으로 재조회하지 않으며 cleanup에서 active를 내려 닫힌 화면에 결과를 반영하지 않는다. */
  useEffect(() => {
    /** 언마운트 후 완료된 기기 저장소 읽기가 화면 상태를 갱신하지 않게 하는 effect 수명 플래그다. */

    let active = true;
    void readSavedSubwayStations()
      .then((value) => {
        if (active) setStations(value);
      })
      .catch(() => {
        if (active) setError('저장한 역을 불러오지 못했습니다. 다시 열어주세요.');
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <View
      style={{ position: 'absolute', inset: 0, paddingTop: top, backgroundColor: mapUi.background }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          gap: 20,
          minHeight: 54,
          borderBottomWidth: 0.5,
          borderColor: mapUi.border,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="내 장소 닫기"
          onPress={onClose}
          style={{ padding: 8 }}
        >
          <SymbolView
            name={{ ios: 'chevron.left', android: 'arrow_back' }}
            size={22}
            tintColor={mapUi.text}
          />
        </Pressable>
        <Text style={{ color: mapUi.text, fontSize: 19, fontWeight: '600' }}>내 장소</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <Text style={{ color: mapUi.text, fontWeight: '600', fontSize: 17, marginBottom: 12 }}>
          저장한 역
        </Text>
        {error ? (
          <Text style={{ color: mapUi.secondaryText, paddingVertical: 12 }}>{error}</Text>
        ) : stations.length === 0 ? (
          <Text style={{ color: mapUi.secondaryText, paddingVertical: 12 }}>
            역 상세에서 별을 눌러 자주 가는 역을 저장하세요.
          </Text>
        ) : (
          stations.map((station) => (
            <Pressable
              accessibilityRole="button"
              key={`${station.stationName}:${station.lineName}`}
              onPress={() => onSubway(station.stationName, station.lineName)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingVertical: 16,
                borderBottomWidth: 0.5,
                borderColor: mapUi.border,
              }}
            >
              <SymbolView
                name={{ ios: 'star.fill', android: 'star' }}
                size={22}
                tintColor={mapUi.blue}
              />
              <View style={{ flex: 1, gap: 5 }}>
                <Text style={{ color: mapUi.text, fontSize: 16 }}>{station.stationName}</Text>
                <Text style={{ color: mapUi.secondaryText }}>{station.lineName}</Text>
              </View>
            </Pressable>
          ))
        )}
        <Text
          style={{
            color: mapUi.text,
            fontWeight: '600',
            fontSize: 17,
            marginTop: 28,
            marginBottom: 12,
          }}
        >
          최근 장소
        </Text>
        {places.map((place) => (
          <Pressable
            accessibilityRole="button"
            key={place.id}
            onPress={() => onPlace(place)}
            style={{
              paddingVertical: 16,
              gap: 6,
              borderBottomWidth: 0.5,
              borderColor: mapUi.border,
            }}
          >
            <Text style={{ color: mapUi.text, fontSize: 16 }}>
              {place.name.replace(/\[.*?\]/g, '')}
            </Text>
            <Text style={{ color: mapUi.secondaryText }}>{place.address}</Text>
          </Pressable>
        ))}
        {!places.length ? (
          <Text style={{ color: mapUi.secondaryText, paddingVertical: 12 }}>
            검색한 장소가 여기에 표시됩니다.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
