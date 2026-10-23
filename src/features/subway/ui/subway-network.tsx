import { TransportIcon } from '@/shared/ui/transport-icon';
/** @fileoverview 인접역 이동, 가로 노선도와 전체 역 목록을 제공한다. 역 선택 상태와 모달 표시 여부는 부모가 소유한다. */

import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import type { SubwayStationLine } from '../api/get-subway-station';
import { mapUi } from '@/shared/ui/map-design-tokens';

/** 지하철 제목과 주요 본문에 쓰는 지도 공통 글자색이다. 지연·보조 정보와 비활성 선택에 사용하는 회색이다. */
const INK = mapUi.text,
  GRAY = mapUi.secondaryText;
type NetworkProps = {
  line: SubwayStationLine | undefined;
  lineName: string;
  color: string;
  onSelectStation?: (name: string, lineName: string) => void;
};

/**
 * 현재 역의 양옆에 공식 인접역과 선택 동작을 표시한다.
 * @param props 선택 역·노선·공식 인접역과 지도 선택 콜백.
 * @returns 역간 이동 막대. 작은 표시값은 메모화하지 않는다.
 */
export function SubwayStationRail({
  stationName,
  lineName,
  line,
  color,
  onSelectStation,
}: NetworkProps & { stationName: string }) {
  return (
    <View style={[s.rail, { backgroundColor: color }]}>
      {line?.previousStation && onSelectStation ? (
        <Pressable
          onPress={() => onSelectStation(line.previousStation!.name, lineName)}
          accessibilityRole="button"
          accessibilityLabel={`이전 역 ${line.previousStation.name}`}
          style={({ pressed }) => [s.adjacentButton, pressed && s.pressed]}
        >
          <Text numberOfLines={1} style={s.adjacentText}>
            ‹ {line.previousStation.name}
          </Text>
        </Pressable>
      ) : (
        <Text style={s.adjacentUnavailable}>이전 역 미제공</Text>
      )}
      <View style={[s.currentStation, { borderColor: color }]}>
        <View style={[s.badge, { backgroundColor: color }]}>
          <Text style={s.badgeText}>{lineName.replace('호선', '')}</Text>
        </View>
        <Text style={s.currentText}>{stationName.replace(/역$/, '')}</Text>
      </View>
      {line?.nextStation && onSelectStation ? (
        <Pressable
          onPress={() => onSelectStation(line.nextStation!.name, lineName)}
          accessibilityRole="button"
          accessibilityLabel={`다음 역 ${line.nextStation.name}`}
          style={({ pressed }) => [s.adjacentButton, pressed && s.pressed]}
        >
          <Text numberOfLines={1} style={[s.adjacentText, { textAlign: 'right' }]}>
            {line.nextStation.name} ›
          </Text>
        </Pressable>
      ) : (
        <Text style={[s.adjacentUnavailable, { textAlign: 'right' }]}>다음 역 미제공</Text>
      )}
    </View>
  );
}

/**
 * 선택 역 근처부터 노선의 역 목록을 가로로 표시한다.
 * @param props 노선·조회 상태·전체 노선도 열기 및 역 선택 콜백.
 * @returns 역 정보가 없을 때의 안내를 포함하는 노선도 섹션.
 */
export function SubwayNetworkPanel({
  line,
  lineName,
  color,
  pending,
  onOpen,
  onSelectStation,
}: NetworkProps & { pending: boolean; onOpen: () => void }) {
  return (
    <View style={s.infoSection}>
      <Text style={s.sectionTitle}>노선도</Text>
      <View style={s.networkPanel}>
        {line?.stations.length ? (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            style={({ pressed }) => [s.networkLabel, pressed && s.pressed]}
          >
            <TransportIcon transport="subway" tintColor={color} size={20} />
            <Text style={s.networkLabelText}>지하철 노선도</Text>
          </Pressable>
        ) : null}
        {line?.stations.length ? (
          <ScrollView
            key={line.stationCode}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentOffset={{
              x:
                Math.max(
                  0,
                  line.stations.findIndex((item) => item.stationCode === line.stationCode) - 3,
                ) * 59,
              y: 0,
            }}
            contentContainerStyle={s.networkStations}
          >
            {line.stations.map((item) => (
              <Pressable
                key={item.stationCode}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}역 선택`}
                accessibilityState={{ selected: item.stationCode === line.stationCode }}
                onPress={() => onSelectStation?.(item.name, lineName)}
                style={({ pressed }) => [
                  s.networkStation,
                  item.stationCode === line.stationCode && s.selectedStation,
                  pressed && s.pressed,
                ]}
              >
                <View style={[s.networkTrack, { backgroundColor: color }]} />
                <View
                  style={[
                    s.networkDot,
                    {
                      borderColor: color,
                      borderWidth: item.stationCode === line.stationCode ? 4 : 1,
                      width: item.stationCode === line.stationCode ? 17 : 10,
                      height: item.stationCode === line.stationCode ? 17 : 10,
                    },
                  ]}
                />
                <Text
                  style={[
                    s.networkStationText,
                    item.stationCode === line.stationCode && { color: INK, fontWeight: '700' },
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={s.unavailable}>
            {pending ? '노선도 조회 중' : '이 노선의 공식 역간 노선도를 제공하지 않습니다.'}
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * 전체 역 목록을 가상화해 표시하고 선택 시 닫기와 지도 이동을 부모에게 전달한다.
 * @param props 모달 표시 여부·공식 노선 정보·닫기와 역 선택 콜백.
 * @returns 전체 화면 노선도 모달. 상태를 복제하지 않으므로 역 선택의 단일 출처가 유지된다.
 */
export function SubwayNetworkModal({
  visible,
  line,
  lineName,
  color,
  onClose,
  onSelectStation,
}: NetworkProps & { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
          <View style={[s.fullToolbar, { paddingHorizontal: 18 }]}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="노선도 닫기"
              style={({ pressed }) => [s.toolbarControl, pressed && s.pressed]}
            >
              <SymbolView
                name={{ ios: 'chevron.left', android: 'chevron_left' }}
                size={24}
                tintColor={INK}
              />
            </Pressable>
            <Text style={[s.sectionTitle, { color }]}>{lineName} 노선도</Text>
          </View>
          <FlatList
            data={line?.stations ?? []}
            keyExtractor={(item) => item.stationCode}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onClose();
                  onSelectStation?.(item.name, lineName);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  s.stationListRow,
                  item.stationCode === line?.stationCode && s.selectedStation,
                  pressed && s.pressed,
                ]}
              >
                <View style={[s.badge, { backgroundColor: color }]}>
                  <Text style={s.badgeText}>{item.stationNumber}</Text>
                </View>
                <Text style={s.sectionTitle}>{item.name}</Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

/** 이 파일의 지하철 표시 요소가 사용하는 고정 스타일을 모듈 범위에서 한 번 만든다. */
const s = StyleSheet.create({
  fullToolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  toolbarControl: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: mapUi.separator,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  selectedStation: { backgroundColor: mapUi.blueSurface },
  adjacentButton: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  adjacentText: { color: 'white', fontSize: 13 },
  networkLabel: {
    borderWidth: 1,
    borderColor: '#E3E3E3',
    borderRadius: 24,
    backgroundColor: 'white',
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    alignSelf: 'flex-end',
    margin: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  networkLabelText: { fontSize: 14, color: INK },
  networkStations: { paddingTop: 25, paddingBottom: 22 },
  networkStation: {
    width: 59,
    minHeight: 80,
    borderRadius: 16,
    alignItems: 'center',
    paddingTop: 12,
  },
  networkTrack: { position: 'absolute', top: 19, left: 0, right: 0, height: 3 },
  networkDot: { backgroundColor: 'white', borderRadius: 12, height: 10, width: 10 },
  networkStationText: {
    marginTop: 10,
    color: GRAY,
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 3,
  },
  stationListRow: {
    minHeight: 64,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 20,
    backgroundColor: mapUi.separator,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  rail: {
    height: 32,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  adjacentUnavailable: { flex: 1, fontSize: 10, color: '#FFF', paddingHorizontal: 8 },
  currentStation: {
    borderWidth: 3,
    borderRadius: 28,
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    minWidth: 104,
    paddingHorizontal: 10,
  },
  currentText: { fontSize: 16, color: '#444' },
  badge: {
    minWidth: 19,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 14, color: 'white', fontWeight: '500' },
  infoSection: { paddingHorizontal: 18, paddingVertical: 20 },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: INK },
  networkPanel: {
    backgroundColor: mapUi.separator,
    borderWidth: 1,
    borderColor: '#E4E4E4',
    borderRadius: 20,
    boxShadow: '0px 3px 0px #22222208',
    marginTop: 18,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unavailable: { fontSize: 14, lineHeight: 21, color: GRAY },
});
