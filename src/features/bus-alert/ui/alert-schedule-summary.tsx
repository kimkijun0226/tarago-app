import { StyleSheet, Text, View } from 'react-native';
import { alertColors as c } from './alert-design';

/** 선택한 예약 조건을 질문 카드 아래에서 하나의 문장으로 안내한다. */
export function AlertScheduleSummary({
  startTime,
  endTime,
  minutes,
  interval,
  urgent,
  transport,
}: {
  startTime: string;
  endTime: string;
  minutes: number;
  interval: number;
  urgent: boolean;
  transport: 'bus' | 'subway';
}) {
  const time = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    return `${hour}시${minute ? ` ${minute}분` : ''}`;
  };
  return (
    <View style={s.container}>
      <Text style={s.text}>
        {time(startTime)}부터 {time(endTime)}까지, {transport === 'bus' ? '버스' : '열차'} 도착{' '}
        {minutes}분 전{interval ? `부터 ${interval}분마다` : '에 한 번'}
        {urgent ? `, 마지막 ${Math.min(5, minutes)}분은 1분마다, 곧 도착할 때도` : ''} 알림으로
        알려드릴게요!
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: c.accentSurface, padding: 16, borderRadius: 16 },
  text: { color: c.accent, fontSize: 14, lineHeight: 22 },
});
