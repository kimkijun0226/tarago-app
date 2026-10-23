import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { TransportIcon } from '@/shared/ui/transport-icon';
import { alertColors as c } from './alert-design';

/** 선택한 교통수단과 알림 방식을 그림과 짧은 설명으로 안내한다. */
export function AlertSetupPreview({
  transport,
  kind,
}: {
  transport: 'bus' | 'subway';
  kind: 'time' | 'location';
}) {
  const scheduled = kind === 'time';
  const name = transport === 'bus' ? '버스' : '지하철';
  return (
    <View style={s.content}>
      <View accessible={false} style={s.scene}>
        <View style={s.road} />
        <View style={s.roadStart} />
        <View style={s.roadEnd} />
        <View style={[s.orbit, !scheduled && s.radius]}>
          <View style={s.vehicle}>
            <TransportIcon transport={transport} size={44} tintColor={c.accent} />
          </View>
        </View>
        <View style={s.symbol}>
          <SymbolView
            name={
              scheduled
                ? { ios: 'clock', android: 'schedule' }
                : { ios: 'location.fill', android: 'near_me' }
            }
            size={27}
            tintColor={c.accent}
          />
        </View>
      </View>
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
      <Text style={s.description}>
        {scheduled
          ? `원하는 ${transport === 'bus' ? '정류소와 버스' : '역과 방면'}를 고르고,\n요일·시간·도착 몇 분 전인지 설정하세요.\n설정한 시간 안에 도착 알림을 보내드려요.`
          : `원하는 ${transport === 'bus' ? '정류소와 버스' : '역과 방면'}를 고르고,\n위치 반경과 재알림 간격을 설정하세요.\n반경 안에서 첫 번째·두 번째 도착을 알려드리고,\n반경을 벗어나면 알림을 멈춰요.`}
      </Text>
      <View style={s.action}>
        <Text style={s.actionText}>설정하기</Text>
        <SymbolView
          name={{ ios: 'arrow.right', android: 'arrow_forward' }}
          size={18}
          tintColor={c.accent}
        />
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  content: { width: '100%', alignItems: 'center', gap: 10, paddingVertical: 8 },
  scene: {
    width: 180,
    height: 116,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbit: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: c.accentSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radius: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.accentBorder },
  vehicle: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  road: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 10,
    height: 2,
    backgroundColor: c.accentBorder,
    borderRadius: 1,
  },
  roadStart: {
    position: 'absolute',
    left: 12,
    bottom: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.accentBorder,
  },
  roadEnd: {
    position: 'absolute',
    right: 12,
    bottom: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.accent,
  },
  symbol: {
    position: 'absolute',
    right: 22,
    top: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: c.accentBorder,
  },
  title: { color: c.text, fontSize: 18, lineHeight: 25, fontWeight: '600' },
  introduction: { color: c.text, fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 290 },
  description: {
    color: c.secondaryText,
    fontSize: 13,
    lineHeight: 21,
    textAlign: 'center',
    maxWidth: 290,
  },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  actionText: { color: c.accent, fontSize: 16, lineHeight: 22, fontWeight: '600' },
});
