import { AlertModes } from '@/features/bus-alert/ui/alert-components';
import type { Dispatch, SetStateAction } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AlertLocationFields } from '@/features/bus-alert/ui/alert-location-fields';
import { AlertScheduleFields } from '@/features/bus-alert/ui/alert-schedule-fields';
import { alertColors as colors } from '@/features/bus-alert/ui/alert-design';
import { createStyles } from '@/features/bus-alert/ui/alert-screen-styles';
import { useSubwayArrivals } from '../model/use-subway-arrivals';
import { useSubwayAlertPresentation } from '../model/use-subway-alert-presentation';
import { subwayAlertSubtitle, destinationLabel } from '../model/subway-direction';
import type { SubwayAlertDraft } from '../model/use-subway-alert-screen';
const styles = createStyles(colors);

export function SubwayAlertEditor({
  draft,
  setDraft,
  threshold,
  setThreshold,
  disabled,
}: {
  draft: SubwayAlertDraft;
  setDraft: Dispatch<SetStateAction<SubwayAlertDraft | null>>;
  threshold: string;
  setThreshold: (value: string) => void;
  disabled: boolean;
}) {
  const presentation = useSubwayAlertPresentation(draft);
  const showSchedule = draft.scheduledEnabled !== false;
  const showLocation = Boolean(draft.proximityEnabled);
  const live = useSubwayArrivals(showSchedule ? draft.stationName : '');
  const arrivals =
    live.data?.arrivals.filter(
      (a) =>
        a.lineId === draft.lineId &&
        a.direction === draft.direction &&
        (!draft.destination || a.destination === draft.destination),
    ) ?? [];
  return (
    <>
      <View style={styles.stationCard}>
        <Text style={styles.stationName}>{draft.stationName}</Text>
        <Text style={styles.help}>{subwayAlertSubtitle(presentation)}</Text>
      </View>
      <AlertModes
        scheduledEnabled={showSchedule}
        proximityEnabled={showLocation}
        disabled={disabled}
        onChange={(modes) => setDraft((current) => current && { ...current, ...modes })}
      />
      {showSchedule && (
        <AlertScheduleFields
          value={draft}
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
      )}
      {showSchedule && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>도착정보</Text>
          {live.isError ? (
            <Text style={styles.warningText}>도착정보를 불러오지 못했어요.</Text>
          ) : live.isPending ? (
            <ActivityIndicator color={colors.accent} />
          ) : !arrivals.length ? (
            <Text style={styles.help}>도착정보 없음</Text>
          ) : (
            arrivals.slice(0, 2).map((a, i) => (
              <Text key={`${a.trainId}:${i}`} style={styles.help}>
                {destinationLabel(a.destination)} · {a.arrivalMessage || '시간 확인 중'}
              </Text>
            ))
          )}
        </View>
      )}
    </>
  );
}
