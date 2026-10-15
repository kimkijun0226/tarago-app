/** @fileoverview 한국 시간 HH:mm 값을 플랫폼 시간 선택기의 Date와 상호 변환해 부모 폼에 전달한다. */
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/shared/ui';

/** 한국 시간 예약을 iOS 휠 또는 Android 시계 선택기로 편집한다. */
export function AlertTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  /** 현재 테마의 의미별 색상을 읽어 밝은 모드와 어두운 모드에 같은 화면 규칙을 적용한다. */
  const { colors } = useAppTheme();

  /** 시간 선택기 노출 여부이며 사용자의 펼침·닫기 조작을 다시 렌더한다. */
  const [expanded, setExpanded] = useState(false);

  // 문자열 분해와 Date 생성은 작은 입력 변환이라 메모 캐시 없이 현재 value로 계산한다.
  /** HH:mm을 나눈 시·분으로 Android의 로컬 Date를 구성한다. */
  const [hours, minutes] = value.split(':').map(Number);

  /** iOS는 한국 시간 절대 시각, Android는 시·분 로컬 값으로 선택기에 전달할 Date다. */
  const date =
    Platform.OS === 'ios'
      ? new Date(`2000-01-01T${value}:00+09:00`)
      : new Date(2000, 0, 1, hours, minutes);
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} 시간 선택, ${value}`}
        accessibilityState={{ expanded }}
        style={{
          minHeight: 52,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={{ color: colors.text, fontSize: 17 }}>{label}</Text>
        <Text
          style={{
            fontSize: 20,
            color: colors.accent,
            paddingVertical: 10,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
      </Pressable>
      {expanded && (
        <DateTimePicker
          value={date}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          presentation={Platform.OS === 'android' ? 'dialog' : 'inline'}
          locale="ko_KR"
          timeZoneName="Asia/Seoul"
          is24Hour
          onDismiss={() => setExpanded(false)}
          onValueChange={(_, selected) => {
            /** 선택한 Date를 플랫폼 변환 규칙에 따라 한국 시간 HH:mm 입력 문자열로 바꾼 값이다. */
            const time =
              Platform.OS === 'ios'
                ? new Date(selected.getTime() + 9 * 60 * 60_000).toISOString().slice(11, 16)
                : `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`;
            onChange(time);
            if (Platform.OS === 'android') setExpanded(false);
          }}
        />
      )}
    </View>
  );
}
