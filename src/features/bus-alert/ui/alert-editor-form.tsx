import type { Dispatch, SetStateAction } from 'react';
import { ActivityIndicator, Switch, Text, View } from 'react-native';
import { useBusArrivals } from '@/features/bus-stop/model/use-bus-arrivals';
import { formatEta, groupBusArrivals } from '@/features/bus-stop/model/bus-arrival';
import type { AlertDraft, AlertKind } from '../model/alert-form';
import { AlertIconButton, AlertModes } from './alert-components';
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
}: {
  draft: AlertDraft;
  setDraft: Dispatch<SetStateAction<AlertDraft | null>>;
  kind: AlertKind;
  threshold: string;
  setThreshold: Dispatch<SetStateAction<string>>;
  disabled?: boolean;
}) {
  const showSchedule = draft.scheduledEnabled ?? kind === 'time';
  const showLocation = draft.proximityEnabled ?? kind === 'location';
  const live = useBusArrivals(showSchedule ? draft.stationId : '');
  const arrivals = (live.data ?? []).filter(
    (bus) =>
      bus.routeId === draft.routeId &&
      (draft.stationSeq === undefined || bus.stationSeq === draft.stationSeq),
  );
  const groups = groupBusArrivals(arrivals);
  return (
    <>
      <View style={styles.stationCard}>
        <Text style={styles.stationName}>{draft.busNumber}번 버스</Text>
        <Text style={styles.help}>{draft.stop.name}</Text>
      </View>
      <AlertModes
        scheduledEnabled={showSchedule}
        proximityEnabled={showLocation}
        disabled={disabled}
        onChange={(modes) => setDraft((current) => current && { ...current, ...modes })}
      />
      {showSchedule && (
        <>
          <AlertScheduleFields
            value={draft}
            threshold={threshold}
            disabled={disabled}
            onThresholdChange={setThreshold}
            onChange={(value) => setDraft((current) => current && { ...current, ...value })}
          />
          <View style={styles.card}>
            <View style={styles.heading}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sectionTitle}>차량번호 표시</Text>
              </View>
              <Switch
                accessibilityLabel="차량번호 표시"
                disabled={disabled}
                value={draft.showVehicleNumber !== false}
                onValueChange={(showVehicleNumber) => setDraft({ ...draft, showVehicleNumber })}
                trackColor={{ true: colors.accent }}
              />
            </View>
          </View>
        </>
      )}
      {showLocation && (
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
      )}
      {showSchedule && (
        <View style={styles.card}>
          <View style={styles.heading}>
            <Text style={{ ...styles.sectionTitle, flex: 1 }}>도착정보</Text>
            <AlertIconButton
              name={{ ios: 'arrow.clockwise', android: 'refresh' }}
              label="도착정보 새로고침"
              disabled={disabled || live.isFetching}
              onPress={() => void live.refetch()}
            />
          </View>
          {live.isError ? (
            <Text style={styles.warningText}>도착정보를 불러오지 못했어요.</Text>
          ) : live.isPending ? (
            <ActivityIndicator color={colors.accent} />
          ) : !groups.length ? (
            <Text style={styles.help}>도착정보 없음</Text>
          ) : (
            groups.map((group) => (
              <View key={`${group.routeId}:${group.stationSeq}`} style={styles.liveRow}>
                <Text style={styles.liveNumber}>{group.busNumber}번</Text>
                <Text style={styles.liveEta}>
                  {formatEta(
                    group.first.etaSeconds,
                    group.first.serviceStatus,
                    group.first.etaPrecision,
                    group.first.etaSource,
                  )}
                </Text>
              </View>
            ))
          )}
        </View>
      )}
    </>
  );
}
