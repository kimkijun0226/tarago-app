/** @fileoverview 지도 좌표가 준비되기 전 보여 주는 로딩·재시도 화면. 위치 조회 자체는 상위 훅에 위임한다. */
import { mapUi } from '@/shared/ui/map-design-tokens';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';

/**
 * 임의의 기본 지역을 먼저 보여 주지 않고 현재 위치 준비 결과를 안내한다.
 * @param props 준비 중 여부와 위치 재시도 동작. 단순 분기와 고정 텍스트만 있어 useMemo가 필요 없다.
 */
export function MapLocationGate({
  preparing,
  onRetry,
}: {
  preparing: boolean;
  onRetry: () => Promise<void>;
}) {
  /** 사용자가 직접 누를 때만 실행하는 단발성 이벤트라 useCallback으로 참조를 보존할 필요가 없다. */
  function openLocationSettings() {
    void Linking.openSettings().catch(() =>
      Alert.alert('설정을 열지 못했어요', '기기 설정에서 타라고의 위치 권한을 확인해주세요.'),
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: mapUi.blueSurface,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
        padding: 32,
      }}
    >
      <Text style={{ color: mapUi.text, fontSize: 40, fontWeight: '800' }}>타라고</Text>
      {preparing ? (
        <>
          <ActivityIndicator color={mapUi.blue} />
          <Text style={{ color: mapUi.text }}>현재 위치를 찾고 있어요</Text>
        </>
      ) : (
        <>
          <Text style={{ color: mapUi.text }}>현재 위치를 확인하지 못했어요.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void onRetry()}
            style={({ pressed }) => ({
              minHeight: 48,
              borderRadius: 20,
              backgroundColor: mapUi.background,
              borderWidth: 1,
              borderBottomWidth: 3,
              borderColor: mapUi.accentBorder,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Text style={{ color: mapUi.text, fontSize: 18, padding: 12 }}>다시 찾기</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={openLocationSettings}
            style={({ pressed }) => ({ minHeight: 44, opacity: pressed ? 0.65 : 1 })}
          >
            <Text style={{ color: mapUi.text, padding: 12 }}>위치 설정 열기</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}
