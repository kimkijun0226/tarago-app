import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertIconButton } from './alert-components';
import { alertColors as colors } from './alert-design';

/** 한국 시간 예약을 편집한다. 휠은 전체 너비로 열어 작은 화면에서도 시간 열이 잘리지 않게 한다. */
export function AlertTimeRange({
  startTime,
  endTime,
  onChange,
  disabled = false,
}: {
  startTime: string;
  endTime: string;
  onChange: (value: { startTime: string; endTime: string }) => void;
  disabled?: boolean;
}) {
  const [active, setActive] = useState<'startTime' | 'endTime' | null>(null);
  const insets = useSafeAreaInsets();
  const value = active === 'endTime' ? endTime : startTime;
  const [hours, minutes] = value.split(':').map(Number);
  const date =
    Platform.OS === 'ios'
      ? new Date(`2000-01-01T${value}:00+09:00`)
      : new Date(2000, 0, 1, hours, minutes);
  const close = () => setActive(null);
  const picker =
    active && !disabled ? (
      <DateTimePicker
        value={date}
        mode="time"
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        presentation={Platform.OS === 'android' ? 'dialog' : 'inline'}
        locale="ko_KR"
        timeZoneName="Asia/Seoul"
        is24Hour
        themeVariant="light"
        accentColor={colors.accent}
        disabled={disabled}
        style={{ width: '100%' }}
        onDismiss={close}
        onValueChange={(_, selected) => {
          const time =
            Platform.OS === 'ios'
              ? new Date(selected.getTime() + 9 * 3600_000).toISOString().slice(11, 16)
              : `${String(selected.getHours()).padStart(2, '0')}:${String(selected.getMinutes()).padStart(2, '0')}`;
          onChange({ startTime, endTime, [active]: time });
          if (Platform.OS === 'android') close();
        }}
      />
    ) : null;
  return (
    <>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {(['startTime', 'endTime'] as const).map((field) => (
          <Pressable
            key={field}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${field === 'startTime' ? '시작' : '종료'} 시간 선택, ${field === 'startTime' ? startTime : endTime}`}
            accessibilityState={{ disabled, expanded: active === field }}
            onPress={() => setActive(field)}
            style={({ pressed }) => ({
              flex: 1,
              gap: 4,
              minHeight: 88,
              backgroundColor: active === field ? colors.accentSurface : colors.secondarySurface,
              borderRadius: 20,
              borderWidth: 1,
              borderBottomWidth: pressed ? 1 : 3,
              borderColor: active === field ? colors.accentBorder : colors.separator,
              padding: 12,
              transform: [{ translateY: pressed ? 2 : 0 }],
            })}
          >
            <Text style={{ fontSize: 14, color: colors.secondaryText }}>
              {field === 'startTime' ? '시작' : '종료'}
            </Text>
            <Text
              style={{
                fontSize: 22,
                fontWeight: '700',
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {field === 'startTime' ? startTime : endTime}
            </Text>
          </Pressable>
        ))}
      </View>
      {Platform.OS === 'ios' ? (
        <Modal
          visible={active !== null && !disabled}
          transparent
          animationType="slide"
          onRequestClose={close}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Pressable
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.2)',
              }}
              accessibilityRole="button"
              accessibilityLabel="시간 선택 닫기"
              onPress={close}
            />
            <View
              style={{
                backgroundColor: colors.surface,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                padding: 20,
                paddingBottom: Math.max(insets.bottom, 20),
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                  {active === 'endTime' ? '종료' : '시작'}
                </Text>
                <AlertIconButton
                  name={{ ios: 'checkmark', android: 'check' }}
                  label="시간 선택 완료"
                  onPress={close}
                />
              </View>
              {picker}
            </View>
          </View>
        </Modal>
      ) : (
        picker
      )}
    </>
  );
}
