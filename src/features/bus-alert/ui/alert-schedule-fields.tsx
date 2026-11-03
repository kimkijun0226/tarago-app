import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RevealSection } from '@/shared/ui/reveal-section';
import { AlertChoice, AlertWeekdays } from './alert-components';
import { AlertTimeRange } from './alert-time-field';
import { alertColors as c } from './alert-design';

type Schedule = {
  id?: string;
  days: number[];
  startTime: string;
  endTime: string;
  notificationStages?: number[];
  advanceRepeatMinutes?: 5 | 10;
};

/** 도착까지 남은 분을 기준으로 반복 시점과 직전 알림을 기존 발송 단계에 저장한다. */
function stagesFor(minutes: number, interval: number, urgent: boolean) {
  const stages = [minutes];
  if (interval) for (let n = minutes - interval; n > 0; n -= interval) stages.push(n);
  if (urgent) for (let n = Math.min(5, minutes); n >= 0; n--) stages.push(n);
  return [...new Set(stages)].sort((a, b) => b - a);
}

export function AlertScheduleFields({
  value,
  onChange,
  threshold,
  onThresholdChange,
  disabled = false,
  order = 1,
  onComplete,
}: {
  value: Schedule;
  onChange: (value: Schedule) => void;
  threshold: string;
  onThresholdChange: (value: string) => void;
  disabled?: boolean;
  order?: number;
  onComplete?: () => void;
}) {
  const [step, setStep] = useState(value.id ? 3 : 0);
  const initialUrgent = Array.from(
    { length: Math.min(5, Number(threshold)) + 1 },
    (_, n) => n,
  ).every((n) => value.notificationStages?.includes(n));
  const [interval, setInterval] = useState<number>(
    () =>
      value.advanceRepeatMinutes ??
      [5, 10].find(
        (n) =>
          JSON.stringify(stagesFor(Number(threshold), n, initialUrgent)) ===
          JSON.stringify([...(value.notificationStages ?? [])].sort((a, b) => b - a)),
      ) ??
      0,
  );
  const [urgent, setUrgent] = useState(initialUrgent);
  const minutes = Number(threshold);
  const valid = Number.isInteger(minutes) && minutes >= 1 && minutes <= 60;
  const scheduleValid =
    value.days.length > 0 &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value.startTime) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(value.endTime) &&
    value.startTime !== value.endTime;
  const update = (nextMinutes: number, nextInterval: number, nextUrgent: boolean) => {
    onChange({
      ...value,
      advanceRepeatMinutes: undefined,
      notificationStages: stagesFor(nextMinutes, nextInterval, nextUrgent),
    });
  };
  const selectMinutes = (next: string) => {
    onThresholdChange(next);
    const number = Number(next);
    if (Number.isInteger(number) && number >= 1 && number <= 60) {
      const nextInterval = interval >= number ? 0 : interval;
      setInterval(nextInterval);
      update(number, nextInterval, urgent);
    }
  };
  return (
    <>
      <RevealSection order={order}>
        <View style={s.card}>
          <Text style={s.question}>언제 알림을 보내드릴까요?</Text>
          <AlertWeekdays
            days={value.days}
            disabled={disabled}
            onChange={(days) => onChange({ ...value, days })}
          />
          <AlertTimeRange
            startTime={value.startTime}
            endTime={value.endTime}
            disabled={disabled}
            onChange={(times) => onChange({ ...value, ...times })}
          />
          {step === 0 && (
            <Pressable
              accessibilityRole="button"
              disabled={disabled || !scheduleValid}
              onPress={() => setStep(1)}
              style={[s.next, !scheduleValid && s.disabled]}
            >
              <Text style={s.nextText}>다음</Text>
            </Pressable>
          )}
        </View>
      </RevealSection>
      {step >= 1 && (
        <RevealSection order={0}>
          <View style={s.card}>
            <Text style={s.question}>몇 분 전부터 알려드릴까요?</Text>
            <View style={s.choices}>
              {[10, 30, 60].map((n) => (
                <AlertChoice
                  key={n}
                  label={`${n}분 전`}
                  selected={minutes === n}
                  disabled={disabled}
                  onPress={() => {
                    selectMinutes(String(n));
                    setStep((current) => Math.max(2, current));
                  }}
                />
              ))}
            </View>
            <View style={s.custom}>
              <Text style={s.caption}>직접 입력</Text>
              <TextInput
                accessibilityLabel="알림 시작, 1분에서 60분 전"
                value={threshold}
                editable={!disabled}
                keyboardType="number-pad"
                maxLength={2}
                onChangeText={selectMinutes}
                style={s.input}
              />
              <Text style={s.caption}>분 전</Text>
              {step === 1 && (
                <Pressable
                  accessibilityRole="button"
                  disabled={disabled || !valid}
                  onPress={() => setStep(2)}
                  style={s.confirm}
                >
                  <Text style={s.link}>선택</Text>
                </Pressable>
              )}
            </View>
          </View>
        </RevealSection>
      )}
      {step >= 2 && (
        <RevealSection order={0}>
          <View style={s.card}>
            <Text style={s.question}>얼마나 자주 알려드릴까요?</Text>
            <View style={s.choices}>
              {[0, 10, 5].map((n) => (
                <AlertChoice
                  key={n}
                  label={n ? `${n}분마다` : '한 번만'}
                  selected={interval === n}
                  disabled={disabled || !valid || (n > 0 && n >= minutes)}
                  onPress={() => {
                    setInterval(n);
                    update(minutes, n, urgent);
                    setStep((current) => Math.max(3, current));
                  }}
                />
              ))}
            </View>
          </View>
        </RevealSection>
      )}
      {step >= 3 && (
        <RevealSection order={0}>
          <View style={s.card}>
            <Text style={s.question}>도착 직전에는 더 자주 알려드릴까요?</Text>
            <View style={s.choices}>
              {[false, true].map((active) => (
                <AlertChoice
                  key={String(active)}
                  label={active ? `${Math.min(5, minutes)}분 전부터 1분마다` : '괜찮아요'}
                  selected={urgent === active}
                  disabled={disabled || !valid}
                  onPress={() => {
                    setUrgent(active);
                    update(minutes, interval, active);
                    setStep(4);
                    onComplete?.();
                  }}
                />
              ))}
            </View>
            {step >= 4 && valid && (
              <Text style={s.summary}>
                {minutes}분 전{interval ? `부터 ${interval}분마다` : '에 한 번'}
                {urgent ? `, 마지막 ${Math.min(5, minutes)}분은 1분마다, 곧 도착할 때도` : ''}{' '}
                알려드려요.
              </Text>
            )}
          </View>
        </RevealSection>
      )}
    </>
  );
}
const s = StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: c.separator,
  },
  question: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: c.text, letterSpacing: -0.4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  custom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caption: { fontSize: 13, color: c.secondaryText },
  input: {
    width: 58,
    height: 40,
    textAlign: 'center',
    backgroundColor: c.secondarySurface,
    borderRadius: 10,
    color: c.text,
    fontSize: 18,
    fontWeight: '600',
  },
  next: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: c.accentSurface,
  },
  nextText: { color: c.accent, fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  confirm: { paddingHorizontal: 12, paddingVertical: 10 },
  link: { color: c.accent, fontSize: 14, fontWeight: '600' },
  summary: {
    color: c.accent,
    backgroundColor: c.accentSurface,
    padding: 12,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 20,
  },
});
