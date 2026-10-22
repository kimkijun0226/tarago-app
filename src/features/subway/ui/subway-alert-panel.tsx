import { ActivityIndicator } from 'react-native';
import {
  AlertNotice,
  AlertPrimaryButton,
  SavedAlertCard,
  EmptyAlertCard,
} from '@/features/bus-alert/ui/alert-components';
import { alertColors as colors } from '@/features/bus-alert/ui/alert-design';
import { createStyles } from '@/features/bus-alert/ui/alert-screen-styles';
import { WEEKDAYS } from '@/features/bus-alert/model/alert-form';
import type { ComponentProps } from 'react';
import { useSubwayAlertPresentation } from '../model/use-subway-alert-presentation';
import { subwayAlertSubtitle } from '../model/subway-direction';
import type { SubwayAlert } from '../model/subway-alert';
import { SubwayMonitoringPanel } from './subway-monitoring-panel';
import type { useSubwayAlertScreen } from '../model/use-subway-alert-screen';
import { SubwayAlertEditor } from './subway-alert-editor';

const styles = createStyles(colors);

/** 공통 알림 페이지 안에서 지하철 목록·편집 내용만 렌더한다. */
export function SubwayAlertsPanel({
  state,
  sources = [],
}: {
  state: ReturnType<typeof useSubwayAlertScreen>;
  sources?: SubwayAlert[];
}) {
  const { draft, busy, list, kind, visibleAlerts } = state;
  const warning =
    state.warning ??
    (list.data?.some((a) => a.enabled && a.scheduledEnabled !== false) &&
    state.pushStatus?.ready === false
      ? '시간 알림을 받으려면 알림 연결을 확인해주세요.'
      : null);
  return (
    <>
      <SubwayMonitoringPanel sources={sources} />
      {warning && (
        <AlertNotice
          action="알림 다시 연결"
          disabled={busy}
          onAction={() => void state.reconnect()}
        >
          {warning}
        </AlertNotice>
      )}
      {draft ? (
        <>
          <SubwayAlertEditor
            draft={draft}
            setDraft={state.setDraft}
            threshold={state.threshold}
            setThreshold={state.setThreshold}
            disabled={busy}
          />
          <AlertPrimaryButton
            title={draft.id ? '변경 사항 저장' : '알림 저장'}
            busy={busy}
            onPress={state.submit}
          />
        </>
      ) : list.isPending ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : (
        <>
          {visibleAlerts.length > 0 &&
            visibleAlerts.map((alert) => (
              <SubwaySavedCard
                key={alert.id}
                alert={alert}
                title={alert.stationName}
                summary={
                  kind === 'time'
                    ? `도착 ${alert.thresholdMinutes}분 전`
                    : `역 ${alert.radius ?? 200}m 이내`
                }
                detail={`${alert.days.map((day) => WEEKDAYS[day]).join(' · ')}${kind === 'time' ? ` · ${alert.startTime}–${alert.endTime}${state.pushStatus?.ready === false ? ' · 알림 연결 필요' : ''}` : ''}`}
                enabled={alert.enabled}
                busy={busy}
                onToggle={(enabled) => void state.persist({ ...alert, enabled })}
                onEdit={() => state.edit(alert)}
                onDelete={() => state.deleteAlert(alert)}
              />
            ))}
          <EmptyAlertCard
            transport="subway"
            kind={kind}
            compact={visibleAlerts.length > 0}
            disabled={busy}
          />
        </>
      )}
    </>
  );
}

function SubwaySavedCard({
  alert,
  ...props
}: { alert: SubwayAlert } & Omit<ComponentProps<typeof SavedAlertCard>, 'subtitle'>) {
  const presentation = useSubwayAlertPresentation(alert);
  return <SavedAlertCard {...props} subtitle={subwayAlertSubtitle(presentation)} />;
}
