import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { readSavedSubwayStations } from '@/features/subway/model/use-saved-subway-station';
import { mapUi } from '@/shared/ui/map-design-tokens';
import type { Place } from '../api/mobility';

/** 로그인 정보 대신 실제 기기에 저장한 역과 최근 장소를 보여준다. */
export function SavedPlaces({ top, places, onClose, onPlace, onSubway }: { top: number; places: Place[]; onClose: () => void; onPlace: (place: Place) => void; onSubway: (station: string, line?: string) => void }) {
  const [stations, setStations] = useState<Awaited<ReturnType<typeof readSavedSubwayStations>>>([]);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; void readSavedSubwayStations().then(value => { if (active) setStations(value); }).catch(() => { if (active) setError('저장한 역을 불러오지 못했습니다. 다시 열어주세요.'); }); return () => { active = false; }; }, []);
  return <View style={{ position: 'absolute', inset: 0, paddingTop: top, backgroundColor: mapUi.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 20, minHeight: 54, borderBottomWidth: .5, borderColor: mapUi.border }}><Pressable accessibilityRole="button" accessibilityLabel="내 장소 닫기" onPress={onClose} style={{ padding: 8 }}><SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={22} tintColor={mapUi.text} /></Pressable><Text style={{ color: mapUi.text, fontSize: 19, fontWeight: '600' }}>내 장소</Text></View>
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={{ color: mapUi.text, fontWeight: '600', fontSize: 17, marginBottom: 12 }}>저장한 역</Text>
      {error ? <Text style={{ color: mapUi.secondaryText, paddingVertical: 12 }}>{error}</Text> : stations.length === 0 ? <Text style={{ color: mapUi.secondaryText, paddingVertical: 12 }}>역 상세에서 별을 눌러 자주 가는 역을 저장하세요.</Text> : stations.map(station => <Pressable accessibilityRole="button" key={`${station.stationName}:${station.lineName}`} onPress={() => onSubway(station.stationName, station.lineName)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: .5, borderColor: mapUi.border }}><SymbolView name={{ ios: 'star.fill', android: 'star', web: 'star' }} size={22} tintColor={mapUi.blue} /><View style={{ flex: 1, gap: 5 }}><Text style={{ color: mapUi.text, fontSize: 16 }}>{station.stationName}</Text><Text style={{ color: mapUi.secondaryText }}>{station.lineName}</Text></View></Pressable>)}
      <Text style={{ color: mapUi.text, fontWeight: '600', fontSize: 17, marginTop: 28, marginBottom: 12 }}>최근 장소</Text>
      {places.map(place => <Pressable accessibilityRole="button" key={place.id} onPress={() => onPlace(place)} style={{ paddingVertical: 16, gap: 6, borderBottomWidth: .5, borderColor: mapUi.border }}><Text style={{ color: mapUi.text, fontSize: 16 }}>{place.name.replace(/\[.*?\]/g, '')}</Text><Text style={{ color: mapUi.secondaryText }}>{place.address}</Text></Pressable>)}
      {!places.length ? <Text style={{ color: mapUi.secondaryText, paddingVertical: 12 }}>검색한 장소가 여기에 표시됩니다.</Text> : null}
    </ScrollView>
  </View>;
}
