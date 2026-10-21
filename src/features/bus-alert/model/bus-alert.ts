/** @fileoverview 버스 알림 데이터 계약과 지오펜스 영역·도착 안내 문구·재방문 판단의 순수 계산을 제공한다. */
import type { BusArrival } from '../../bus-stop/api/get-bus-arrivals';
import { formatEta, groupBusArrivals } from '../../bus-stop/model/bus-arrival.ts';

export type AlertStop = {
  id: string;
  name: string;
  arsId?: string | null;
  latitude: number;
  longitude: number;
};
export type BusAlertInput = {
  stationId: string;
  routeId: string;
  stationSeq?: number;
  days: number[];
  startTime: string;
  endTime: string;
  thresholdMinutes: number;
  scheduledEnabled: boolean;
  proximityEnabled: boolean;
  radius: number;
  enabled: boolean;
  notificationStages?: number[];
  showVehicleNumber?: boolean;
  monitoringStartedAt?: string;
  monitoringEndsAt?: string;
  monitoringSourceId?: string;
};
export type BusAlert = BusAlertInput & { id: string; stop: AlertStop; busNumber: string };

/** 같은 정류장의 여러 노선은 지오펜스 한 개로 묶어 iOS 20개 제한을 지킨다. */
export function proximityRegions(
  alerts: Pick<BusAlert, 'stop' | 'enabled' | 'proximityEnabled' | 'radius'>[],
) {
  /** 같은 정류소의 여러 설정을 한 영역으로 합치는 ID별 지오펜스 저장소다. */
  const stops = new Map<
    string,
    {
      identifier: string;
      latitude: number;
      longitude: number;
      radius: number;
      notifyOnEnter: boolean;
      notifyOnExit: boolean;
    }
  >();
  for (const alert of alerts) {
    if (!alert.enabled || !alert.proximityEnabled) continue;

    /** 이미 합친 같은 정류소의 영역으로 더 큰 알림 반경을 보존하는 기준이다. */
    const previous = stops.get(alert.stop.id);
    stops.set(alert.stop.id, {
      identifier: alert.stop.id,
      latitude: alert.stop.latitude,
      longitude: alert.stop.longitude,
      radius: Math.max(previous?.radius ?? 0, alert.radius),
      notifyOnEnter: true,
      notifyOnExit: true,
    });
  }
  return [...stops.values()];
}

/** 선택 노선은 두 차량을 줄바꿈해 요약하고, 노선을 지정하지 않으면 정류장 전체를 요약한다. */
export function proximityMessage(
  arrivals: BusArrival[],
  alert?: Pick<BusAlert, 'routeId' | 'stationSeq' | 'busNumber' | 'showVehicleNumber'>,
) {
  if (alert) {
    /** 같은 차량 ID가 공급자 응답에 반복돼도 두 차량 안내에 중복 표시하지 않게 한다. */
    const seen = new Set<string>();

    /** 선택 노선·정류소 순번에 맞고 차량 중복이 제거된 도착정보다. */
    const selected = arrivals
      .filter(
        (bus) =>
          bus.routeId === alert.routeId &&
          (alert.stationSeq === undefined || bus.stationSeq === alert.stationSeq),
      )
      .filter((bus) => {
        if (!bus.vehicleId) return true;
        if (seen.has(bus.vehicleId)) return false;
        seen.add(bus.vehicleId);
        return true;
      });

    /** 선택 노선에서 먼저 도착할 두 차량을 묶은 결과이며 정보가 없으면 조회 중 안내로 대체한다. */
    const group = groupBusArrivals(selected)[0];
    if (!group) return `${alert.busNumber}번 버스 · 도착정보 확인 중`;

    /** 첫 차량과 다음 차량의 도착 시각·남은 정거장·번호판 표시를 각각 구성한 줄들이다. */
    const lines = [group.first, group.second]
      .filter((bus): bus is BusArrival => Boolean(bus))
      .map((bus, index) => {
        /** 정보 없음·30초 이내·분 단위 예상에 맞춰 구성한 사용자용 도착 시각이다. */
        const time =
          bus.etaSeconds === null
            ? formatEta(null, bus.serviceStatus)
            : !bus.etaSource && bus.etaSeconds <= 30
              ? '곧 도착'
              : `${bus.etaSource ? '예상 ' : ''}${Math.max(1, Math.ceil(bus.etaSeconds / 60))}분 후`;

        /** 남은 정거장 수를 제공한 경우에만 덧붙일 안내 문자열이다. */
        const stops = bus.remainingStops === null ? '' : ` (${bus.remainingStops}정거장 전)`;

        /** 차량번호 표시를 허용한 경우에만 번호판 끝 네 자리를 추출한 값이다. */
        const lastFour =
          alert.showVehicleNumber !== false
            ? bus.vehicleNumber?.match(/(\d{4})\s*$/)?.[1]
            : undefined;
        return `${index ? '다음 ' : ''}${time}${stops}${lastFour ? ` ${lastFour}` : ''}`;
      });
    return `${alert.busNumber}번 버스\n${lines.join('\n')}`;
  }

  /** 노선별 첫 도착 차량을 요약하기 위한 정류소 전체 도착정보 묶음이다. */
  const groups = groupBusArrivals(arrivals);
  if (!groups.length) return '현재 도착정보가 없습니다. 알림을 눌러 다시 확인하세요.';

  /** 최대 여덟 노선의 도착정보를 한 줄로 이어 만든 알림 본문이다. */
  const summary = groups
    .slice(0, 8)
    .map(
      (group) =>
        `${group.busNumber}번 ${formatEta(group.first.etaSeconds, group.first.serviceStatus, group.first.etaPrecision, group.first.etaSource)}`,
    )
    .join(' · ');
  return summary + (groups.length > 8 ? ` · 외 ${groups.length - 8}개 노선` : '');
}

/** 5분의 재진입 간격은 GPS 경계 흔들림에 의한 반복 알림을 막는다. */
export function shouldNotifyVisit(state: { inside?: boolean; lastSent?: number }, now: number) {
  return !state.inside && (state.lastSent === undefined || now - state.lastSent >= 5 * 60_000);
}
