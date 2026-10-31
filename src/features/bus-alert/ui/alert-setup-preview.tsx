import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { alertColors as c } from './alert-design';

/** 교통수단과 설정할 조건을 절제된 정보 위계로 안내한다. */
export function AlertSetupPreview({
  transport,
  kind,
  needsLocationPermission = false,
  locationPermissionError = false,
  preparing = false,
}: {
  transport: 'bus' | 'subway';
  kind: 'time' | 'location';
  needsLocationPermission?: boolean;
  locationPermissionError?: boolean;
  preparing?: boolean;
}) {
  const scheduled = kind === 'time';
  const name = transport === 'bus' ? '버스' : '지하철';
  return (
    <View style={s.content}>
      <View accessible={false} style={s.icons}>
        <TransportIcon transport={transport} size={30} tintColor={c.accent} />
        <View style={s.divider} />
        <SymbolView
          name={
            scheduled
              ? { ios: 'clock', android: 'schedule' }
              : { ios: 'location', android: 'near_me' }
          }
          size={22}
          tintColor={c.accent}
          weight="regular"
        />
      </View>
      <View style={s.copy}>
        <Text style={s.title}>
          {scheduled
            ? `${name} 예약 알림`
            : `${transport === 'bus' ? '버스 정류소' : '지하철역'} 위치 알림`}
        </Text>
        <Text style={s.introduction}>
          {scheduled
            ? '정해둔 시간에 도착을 알려주는 알림이에요.'
            : `내가 ${transport === 'bus' ? '정류소' : '지하철역'} 근처에 갔을 때 알려주는 알림이에요.`}
        </Text>
      </View>
      <Text style={s.description}>
        {scheduled
          ? `원하는 ${transport === 'bus' ? '정류소와 버스' : '역과 방면'}를 고르고, 요일·시간과 도착 알림 조건을 설정하세요.`
          : `원하는 ${transport === 'bus' ? '정류소와 버스' : '역과 방면'}를 고르고, 위치 반경과 재알림 간격을 설정하세요.`}
      </Text>
      {!scheduled && needsLocationPermission ? (
        <Text style={s.permission}>
          {locationPermissionError
            ? '위치 권한 확인이 필요해요. 설정하기에서 다시 확인할 수 있어요.'
            : `앱을 사용하지 않을 때도 근처에 도착하면 알려드리려면 위치 권한을 ‘${Platform.OS === 'ios' ? '항상' : '항상 허용'}’으로 설정해야 해요. 설정하기를 누르면 권한 설정을 시작해요.`}
        </Text>
      ) : null}
      <View style={s.action}>
        <Text style={s.actionText}>{preparing ? '권한 확인 중' : '설정하기'}</Text>
        {preparing ? (
          <ActivityIndicator color={c.accent} />
        ) : (
          <SymbolView
            name={{ ios: 'arrow.right', android: 'arrow_forward' }}
            size={18}
            tintColor={c.accent}
          />
        )}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  content: { width: '100%', gap: 16, paddingVertical: 4 },
  icons: {
    alignSelf: 'flex-start',
    backgroundColor: c.accentSurface,
    borderRadius: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
  },
  divider: { height: 20, width: 1, backgroundColor: c.accentBorder },
  copy: { gap: 4 },
  title: { fontSize: 19, lineHeight: 26, fontWeight: '600', letterSpacing: -0.4, color: c.text },
  introduction: { fontSize: 14, lineHeight: 21, color: c.bodyText },
  description: { fontSize: 13, lineHeight: 21, color: c.secondaryText },
  permission: { color: c.accent, fontSize: 13, lineHeight: 21 },
  action: {
    minHeight: 48,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.separator,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  actionText: { fontSize: 15, fontWeight: '600', color: c.accent },
});
