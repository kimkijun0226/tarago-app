import { useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { AlertSetupNote } from '@/features/bus-alert/ui/alert-components';
import { RevealSection } from '@/shared/ui/reveal-section';
import { AlertVoiceField } from '@/features/bus-alert/ui/alert-voice-field';
import { AlertTargetSummary } from '@/features/bus-alert/ui/alert-target-summary';
import { Switch, Text, View } from 'react-native';
import type { AlertDraft, AlertKind } from '../model/alert-form';
import { AlertLocationFields } from './alert-location-fields';
import { AlertScheduleFields } from './alert-schedule-fields';
import { createStyles } from './alert-screen-styles';
import { alertColors as colors } from './alert-design';

const styles = createStyles(colors);

/** 버스 알림의 입력 UI. 서버 저장과 권한 확인은 컨트롤러 훅이 담당한다. */
export function AlertEditorForm({
  draft,
  setDraft,
  kind,
  threshold,
  setThreshold,
  disabled = false,
  footer,
}: {
  draft: AlertDraft;
  setDraft: Dispatch<SetStateAction<AlertDraft | null>>;
  kind: AlertKind;
  threshold: string;
  setThreshold: Dispatch<SetStateAction<string>>;
  disabled?: boolean;
  footer?: ReactNode;
}) {
  const [scheduleComplete, setScheduleComplete] = useState(Boolean(draft.id));
  const showSchedule = draft.scheduledEnabled ?? kind === 'time';
  const showLocation = draft.proximityEnabled ?? kind === 'location';
  return (
    <>
      <RevealSection order={0}>
        <AlertTargetSummary
          transport="bus"
          title={`${draft.busNumber}번 버스`}
          subtitle={draft.stop.name}
        />
      </RevealSection>

      {showSchedule && (
        <>
          <AlertScheduleFields
            value={draft}
            onComplete={() => setScheduleComplete(true)}
            threshold={threshold}
            disabled={disabled}
            onThresholdChange={setThreshold}
            onChange={(value) => setDraft((current) => current && { ...current, ...value })}
          />
        </>
      )}
      {showLocation && (
        <RevealSection order={showSchedule ? 4 : 1}>
          <AlertLocationFields
            days={draft.days}
            radius={draft.radius}
            disabled={disabled}
            showDays={!showSchedule}
            repeatMinutes={draft.repeatMinutes ?? 5}
            onRepeatMinutesChange={(repeatMinutes) => setDraft({ ...draft, repeatMinutes })}
            onDaysChange={(days) => setDraft({ ...draft, days })}
            onRadiusChange={(radius) => setDraft({ ...draft, radius })}
          />
        </RevealSection>
      )}
      {(!showSchedule || scheduleComplete) && (
        <>
          <RevealSection order={5}>
            <AlertVoiceField
              busNumber={draft.busNumber}
              profile={draft.voiceProfile ?? 'clear-young'}
              onProfileChange={(voiceProfile) =>
                setDraft((current) => current && { ...current, voiceProfile })
              }
              enabled={draft.voiceEnabled ?? Boolean(draft.id)}
              disabled={disabled}
              onChange={(voiceEnabled) =>
                setDraft((current) => current && { ...current, voiceEnabled })
              }
            />
          </RevealSection>
          <RevealSection order={6}>
            <View style={styles.card}>
              <View style={styles.heading}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.sectionTitle}>차량번호 표시</Text>
                  <Text style={styles.detail}>버스 번호판 뒤 4자리를 알림에 표시해요.</Text>
                </View>
                <Switch
                  accessibilityLabel="버스 번호판 뒤 4자리 표시"
                  disabled={disabled}
                  value={draft.showVehicleNumber ?? Boolean(draft.id)}
                  onValueChange={(showVehicleNumber) => setDraft({ ...draft, showVehicleNumber })}
                  trackColor={{ true: colors.accent }}
                />
              </View>
            </View>
          </RevealSection>
          <AlertSetupNote scheduled={showSchedule} proximity={showLocation} />
          {footer}
        </>
      )}
    </>
  );
}
