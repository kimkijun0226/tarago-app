import { useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { AlertSetupNote } from '@/features/bus-alert/ui/alert-components';
import { RevealSection } from '@/shared/ui/reveal-section';
import { AlertVoiceField } from '@/features/bus-alert/ui/alert-voice-field';
import { SubwayAlertDirectionFields } from './subway-alert-direction-fields';
import { AlertTargetSummary } from '@/features/bus-alert/ui/alert-target-summary';
import { AlertLocationFields } from '@/features/bus-alert/ui/alert-location-fields';
import { AlertScheduleFields } from '@/features/bus-alert/ui/alert-schedule-fields';
import { useSubwayAlertPresentation } from '../model/use-subway-alert-presentation';
import { subwayAlertSubtitle } from '../model/subway-direction';
import type { SubwayAlertDraft } from '../model/use-subway-alert-screen';

export function SubwayAlertEditor({
  draft,
  setDraft,
  threshold,
  setThreshold,
  disabled,
  footer,
}: {
  draft: SubwayAlertDraft;
  setDraft: Dispatch<SetStateAction<SubwayAlertDraft | null>>;
  threshold: string;
  setThreshold: (value: string) => void;
  disabled: boolean;
  footer?: ReactNode;
}) {
  const presentation = useSubwayAlertPresentation(draft);
  const [scheduleComplete, setScheduleComplete] = useState(Boolean(draft.id));
  const showSchedule = draft.scheduledEnabled !== false;
  const showLocation = Boolean(draft.proximityEnabled);
  return (
    <>
      <RevealSection order={0}>
        <AlertTargetSummary
          transport="subway"
          title={draft.stationName}
          subtitle={subwayAlertSubtitle(presentation)}
        />
      </RevealSection>

      <RevealSection order={1}>
        <SubwayAlertDirectionFields draft={draft} setDraft={setDraft} disabled={disabled} />
      </RevealSection>
      {showSchedule && (
        <AlertScheduleFields
          transport="subway"
          value={draft}
          onComplete={() => setScheduleComplete(true)}
          order={2}
          disabled={disabled}
          threshold={threshold}
          onThresholdChange={setThreshold}
          onChange={(value) =>
            setDraft(
              (current) =>
                current && {
                  ...current,
                  ...value,
                  notificationStages: value.notificationStages ?? [],
                },
            )
          }
        />
      )}
      {showLocation && (
        <RevealSection order={showSchedule ? 5 : 2}>
          <AlertLocationFields
            days={draft.days}
            radius={draft.radius ?? 200}
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
          <RevealSection order={6}>
            <AlertVoiceField
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
          <AlertSetupNote scheduled={showSchedule} proximity={showLocation} />
          {footer}
        </>
      )}
    </>
  );
}
