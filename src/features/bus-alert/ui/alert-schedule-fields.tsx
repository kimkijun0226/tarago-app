import { Text, TextInput, View } from 'react-native';
import { defaultStages } from '../model/alert-form';
import { AlertChoice, AlertWeekdays } from './alert-components';
import { AlertTimeRange } from './alert-time-field';
import { alertColors as colors } from './alert-design';
import { createStyles } from './alert-screen-styles';

const styles = createStyles(colors);
type Schedule = {
  days: number[];
  startTime: string;
  endTime: string;
  notificationStages?: number[];
};

/** 버스와 지하철이 공유하는 예약 입력. 사용자의 단계 선택을 기준 분 변경 시에도 보존한다. */
export function AlertScheduleFields({
  value,
  onChange,
  threshold,
  onThresholdChange,
  disabled = false,
}: {
  value: Schedule;
  onChange: (value: Schedule) => void;
  threshold: string;
  onThresholdChange: (value: string) => void;
  disabled?: boolean;
}) {
  const minutes = Number(threshold);
  const selected = value.notificationStages ?? defaultStages(minutes);
  const options = [...new Set([...defaultStages(minutes), ...selected])]
    .filter((s) => Number.isInteger(s) && s >= 0 && s <= minutes)
    .sort((a, b) => b - a);
  const changeThreshold = (text: string) => {
    const next = Number(text);
    onThresholdChange(text);
    if (!Number.isInteger(next) || next < 1 || next > 30) return;
    const stages = selected.map((s) => (s === minutes ? next : s)).filter((s) => s <= next);
    onChange({ ...value, notificationStages: [...new Set(stages)] });
  };
  return (
    <>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>반복 요일 선택</Text>
        <AlertWeekdays
          days={value.days}
          disabled={disabled}
          onChange={(days) => onChange({ ...value, days })}
        />
      </View>
      <View style={styles.card}>
        <AlertTimeRange
          startTime={value.startTime}
          endTime={value.endTime}
          disabled={disabled}
          onChange={(times) => onChange({ ...value, ...times })}
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>도착 알림</Text>
        <View style={styles.inline}>
          <TextInput
            accessibilityLabel="도착 알림 기준 분"
            editable={!disabled}
            value={threshold}
            onChangeText={changeThreshold}
            keyboardType="number-pad"
            maxLength={2}
            style={styles.numberInput}
            selectionColor={colors.accent}
          />
          <Text style={styles.help}>분 전부터</Text>
        </View>
        <View style={styles.chips}>
          {options.map((stage) => (
            <AlertChoice
              key={stage}
              label={stage === 0 ? '곧 도착' : `${stage}분 전`}
              selected={selected.includes(stage)}
              disabled={disabled}
              onPress={() =>
                onChange({
                  ...value,
                  notificationStages: selected.includes(stage)
                    ? selected.filter((s) => s !== stage)
                    : [...selected, stage],
                })
              }
            />
          ))}
        </View>
      </View>
    </>
  );
}
