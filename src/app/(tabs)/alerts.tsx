import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAlerts } from '@/features/bus-alert/model/use-alerts';
import { useSubwayAlerts } from '@/features/subway/model/use-subway-alerts';
import {
  busDraftFromRoute,
  subwayDraftFromRoute,
  routeKind,
  type AlertRouteParams,
} from '@/features/bus-alert/model/alert-route';
import { resolveAlertKind } from '@/features/bus-alert/model/alert-form';
import { AlertsScreenContent } from '@/features/bus-alert/ui/alerts-screen';

/** 지도 선택·푸시·기존 알림 모두 같은 알림 화면에서 원래 종류로 편집한다. */
export default function AlertsScreen() {
  const [openedAt] = useState(Date.now);
  const params = useLocalSearchParams<AlertRouteParams>();
  const { data: alerts = [] } = useAlerts();
  const { data: subwayAlerts = [] } = useSubwayAlerts();
  const transport =
    params.alertTransport === 'subway'
      ? 'subway'
      : params.alertTransport === 'bus' || params.routeId || params.alertId
        ? 'bus'
        : undefined;
  const saved = transport === 'bus' ? alerts.find((a) => a.id === params.alertId) : undefined;
  const savedSubway =
    transport === 'subway' ? subwayAlerts.find((a) => a.id === params.alertId) : undefined;
  const initial = saved ?? busDraftFromRoute(params, openedAt);
  const initialSubway = savedSubway ?? subwayDraftFromRoute(params, openedAt);
  const savedAlert = saved ?? savedSubway;
  const kind =
    routeKind(params.alertKind) ?? (savedAlert ? resolveAlertKind(savedAlert) : undefined);

  return (
    <AlertsScreenContent
      key={`${params.requestId ?? ''}:${params.alertId ?? ''}:${transport ?? ''}:${kind ?? ''}:${Boolean(saved || savedSubway)}`}
      initialDraft={initial}
      initialSubwayDraft={initialSubway}
      initialTransport={transport}
      initialKind={kind}
    />
  );
}
