/** @fileoverview 지하철 알림 라우트. URL의 역·노선·방면과 저장한 예약으로 초기 초안을 구성한다. */
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useSubwayAlerts } from '@/features/subway/model/use-subway-alerts';
import type { SubwayAlertInput } from '@/features/subway/model/subway-alert';
import { SubwayAlertsContent } from '@/features/subway/ui/subway-alerts-screen';

/**
 * 경로 파라미터나 저장한 예약을 편집 초안으로 변환한다. 요청 ID 변경 시 편집 영역을 재마운트한다.
 * @returns 초기 초안을 전달받은 지하철 알림 화면.
 */
export default function SubwayAlertsScreen() {
  /** 지도 또는 예약 진입 경로에서 받은 역·노선·방면·요청 및 예약 식별자다. */
  const params = useLocalSearchParams<{
    stationName?: string;
    lineId?: string;
    lineName?: string;
    direction?: string;
    requestId?: string;
    alertId?: string;
  }>();

  /** 경로로 지정한 기존 예약을 찾을 서버 예약 목록 Query다. */
  const alerts = useSubwayAlerts();

  /** alertId가 지정한 기존 예약이다. 있으면 새 초안보다 우선한다. */
  const saved = alerts.data?.find((a) => a.id === params.alertId);

  /** 화면이 처음 열린 시각을 고정해 재렌더마다 기본 감시 시간이 밀리지 않게 한다. */
  const [openedAt] = useState(Date.now);

  /** 화면 진입 시각을 한국 시간으로 변환한 기본 감시 시작 시·분이다. */
  const startTime = new Date(openedAt + 9 * 3600_000).toISOString().slice(11, 16);

  /** 기본 시작 시각 한 시간 뒤의 감시 종료 시·분이다. */
  const endTime = new Date(openedAt + 10 * 3600_000).toISOString().slice(11, 16);

  /** 기존 예약을 우선하고 유효한 새 요청이면 평일 감시 기본값을 구성한 최초 편집 초안이다. */
  const initial: (SubwayAlertInput & { id?: string }) | null =
    saved ??
    (params.requestId && params.stationName && params.lineId && params.direction
      ? {
          stationName: params.stationName,
          lineId: params.lineId,
          lineName: params.lineName,
          direction: params.direction,
          days: [1, 2, 3, 4, 5],
          startTime,
          endTime,
          thresholdMinutes: 5,
          notificationStages: [5, 3, 2, 1, 0],
          enabled: true,
        }
      : null);
  return (
    <SubwayAlertsContent
      key={`${params.requestId ?? ''}:${params.alertId ?? ''}:${Boolean(saved)}`}
      initial={initial}
    />
  );
}
