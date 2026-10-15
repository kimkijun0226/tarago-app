/** @fileoverview 버스 알림 라우트. URL 요청·저장된 알림으로 초기 편집 초안을 구성한다. */
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAlerts } from '@/features/bus-alert/model/use-alerts';
import type { AlertDraft } from '@/features/bus-alert/ui/alert-editor-form';
import { AlertsScreenContent } from '@/features/bus-alert/ui/alerts-screen';

/** 알림 목록과 정류소·노선별 편집기를 같은 탭에서 보여준다. */
export default function AlertsScreen() {
  /** 라우트 요청 시각이 유효하지 않을 때 사용할 화면 진입 시각으로 이 마운트 동안 유지한다. */
  const [openedAt] = useState(() => Date.now());

  /** 지도·알림에서 전달한 정류소·노선·편집 대상·요청 구분 값을 읽는다. */
  const params = useLocalSearchParams<{
    stationId?: string;
    stationName?: string;
    latitude?: string;
    longitude?: string;
    routeId?: string;
    busNumber?: string;
    stationSeq?: string;
    requestId?: string;
    alertId?: string;
    sourceAlertId?: string;
    sourceAlertIds?: string;
    monitoringId?: string;
  }>();

  /** 현재 기기에 저장된 서버 알림 목록으로, 필터와 감시 설정의 원본이다. */
  const { data: alerts = [] } = useAlerts();

  // 라우트와 서버 목록에서 얻는 작은 조회·필터는 별도 메모 캐시 없이 현재 값으로 계산한다.
  /** 알림 ID로 기존 서버 레코드를 찾아 편집 초안을 복원한다. */
  const saved = params.alertId ? alerts.find((a) => a.id === params.alertId) : undefined;

  /** 접근 안내로 전달된 복수 ID 또는 이전 단일 ID를 같은 조회 형식으로 정규화한다. */
  const sourceIds = (params.sourceAlertIds || params.sourceAlertId || '').split(',');

  /** 접근 제안 대상 중 서버에서 여전히 활성화된 위치 알림만 표시한다. */
  const sources = alerts.filter((a) => sourceIds.includes(a.id) && a.enabled && a.proximityEnabled);

  /** 기존 알림 또는 검증된 지도 요청으로 만든 최초 편집 값이며 없으면 목록을 연다. */
  let initialDraft: AlertDraft | null = saved ?? null;

  /** 라우트의 위도·경도를 숫자로 복원해 유한값과 지리 범위를 검사한다. */
  const latitude = Number(params.latitude),
    longitude = Number(params.longitude);
  if (
    !params.alertId &&
    params.requestId &&
    params.stationId &&
    params.routeId &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    /** 지도에서 넘긴 요청 시각을 숫자로 복원해 새 예약의 시간 기준을 결정한다. */
    const requestedAt = Number(params.requestId);

    /** 유효한 요청 시각이 있으면 사용하고 없으면 화면 진입 시각으로 초기 시간을 고정한다. */
    const now = Number.isFinite(requestedAt) && requestedAt > 0 ? requestedAt : openedAt;

    /** 새 알림의 시작 시각을 요청 시점의 한국 시간 HH:mm으로 만든다. */
    const startTime = new Date(now + 9 * 60 * 60_000).toISOString().slice(11, 16);

    /** 새 알림의 기본 종료를 시작 기준 두 시간 뒤의 한국 시간으로 정한다. */
    const endTime = new Date(now + 11 * 60 * 60_000).toISOString().slice(11, 16);
    initialDraft = {
      stationId: params.stationId,
      routeId: params.routeId,
      busNumber: params.busNumber ?? params.routeId,
      ...(params.stationSeq ? { stationSeq: Number(params.stationSeq) } : {}),
      stop: { id: params.stationId, name: params.stationName ?? '정류소', latitude, longitude },
      days: [1, 2, 3, 4, 5],
      startTime,
      endTime,
      thresholdMinutes: 5,
      scheduledEnabled: true,
      enabled: true,
      proximityEnabled: false,
      radius: 200,
      notificationStages: [5, 3, 2, 1, 0],
      showVehicleNumber: true,
    };
  }
  return (
    <AlertsScreenContent
      key={`${params.requestId ?? ''}:${params.alertId ?? ''}:${Boolean(saved)}`}
      initialDraft={initialDraft}
      sources={sources}
    />
  );
}
