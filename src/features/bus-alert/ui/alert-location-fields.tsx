import { Text, View } from 'react-native';
import { AlertChoice, AlertWeekdays } from './alert-components';
import { createStyles } from './alert-screen-styles';
import { alertColors as colors } from './alert-design';
const styles = createStyles(colors);
export function AlertLocationFields({
  days,
  radius,
  repeatMinutes,
  onDaysChange,
  onRadiusChange,
  onRepeatMinutesChange,
  disabled,
  showDays = true,
}: {
  days: number[];
  radius: number;
  repeatMinutes: number;
  onDaysChange: (days: number[]) => void;
  onRadiusChange: (radius: 100 | 200 | 300 | 500) => void;
  onRepeatMinutesChange: (minutes: number) => void;
  disabled?: boolean;
  showDays?: boolean;
}) {
  return (
    <View style={styles.card}>
      {showDays && (
        <>
          <Text style={styles.sectionTitle}>반복 요일 선택</Text>
          <AlertWeekdays days={days} onChange={onDaysChange} disabled={disabled} />
        </>
      )}
      <Text style={styles.sectionTitle}>접근 반경</Text>
      <View style={styles.chips}>
        {([100, 200, 300, 500] as const).map((value) => (
          <AlertChoice
            key={value}
            label={`${value}m`}
            selected={radius === value}
            disabled={disabled}
            onPress={() => onRadiusChange(value)}
          />
        ))}
      </View>
      <Text style={styles.sectionTitle}>재알림 간격</Text>
      <View style={styles.chips}>
        {[1, 3, 5, 10].map((minutes) => (
          <AlertChoice
            key={minutes}
            label={`${minutes}분`}
            selected={repeatMinutes === minutes}
            disabled={disabled}
            onPress={() => onRepeatMinutesChange(minutes)}
          />
        ))}
      </View>
    </View>
  );
}
