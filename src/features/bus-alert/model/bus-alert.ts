import type { BusArrival } from '../../bus-stop/api/get-bus-arrivals';
import { formatEta, groupBusArrivals } from '../../bus-stop/model/bus-arrival.ts';

export type AlertStop = { id: string; name: string; arsId?: string | null; latitude: number; longitude: number };
export type BusAlertInput = {
  stationId: string; routeId: string; stationSeq?: number; days: number[];
  startTime: string; endTime: string; thresholdMinutes: number;
  scheduledEnabled: boolean; proximityEnabled: boolean; radius: number; enabled: boolean;
  notificationStages?: number[];
  showVehicleNumber?: boolean;
  monitoringStartedAt?: string;
  monitoringEndsAt?: string;
  monitoringSourceId?: string;
};
export type BusAlert = BusAlertInput & { id: string; stop: AlertStop; busNumber: string };

/** 같은 정류장의 여러 노선은 지오펜스 한 개로 묶어 iOS 20개 제한을 지킨다. */
export function proximityRegions(alerts: Pick<BusAlert, 'stop' | 'enabled' | 'proximityEnabled' | 'radius'>[]) {
  const stops = new Map<string, { identifier: string; latitude: number; longitude: number; radius: number; notifyOnEnter: boolean; notifyOnExit: boolean }>();
  for (const alert of alerts) {
    if (!alert.enabled || !alert.proximityEnabled) continue;
    const previous = stops.get(alert.stop.id);
    stops.set(alert.stop.id, { identifier: alert.stop.id, latitude: alert.stop.latitude, longitude: alert.stop.longitude,
      radius: Math.max(previous?.radius ?? 0, alert.radius), notifyOnEnter: true, notifyOnExit: true });
  }
  return [...stops.values()];
}

/** 선택 노선은 두 차량을 줄바꿈해 요약하고, 노선을 지정하지 않으면 정류장 전체를 요약한다. */
export function proximityMessage(arrivals: BusArrival[],alert?:Pick<BusAlert,'routeId'|'stationSeq'|'busNumber'|'showVehicleNumber'>) {
  if(alert) {
    const seen=new Set<string>();
    const selected=arrivals.filter(bus=>bus.routeId===alert.routeId && (alert.stationSeq===undefined || bus.stationSeq===alert.stationSeq))
      .filter(bus=>{if(!bus.vehicleId)return true;if(seen.has(bus.vehicleId))return false;seen.add(bus.vehicleId);return true;});
    const group=groupBusArrivals(selected)[0];
    if(!group)return `${alert.busNumber}번 버스 · 도착정보 확인 중`;
    const lines=[group.first,group.second].filter((bus):bus is BusArrival=>Boolean(bus)).map((bus,index)=>{
      const time=bus.etaSeconds===null ? formatEta(null,bus.serviceStatus) : bus.etaSeconds<=30 ? '곧 도착' : `${bus.etaSource ? '예상 ' : ''}${Math.max(1,Math.ceil(bus.etaSeconds/60))}분 후`;
      const stops=bus.remainingStops===null ? '' : ` (${bus.remainingStops}정거장 전)`;
      const lastFour=alert.showVehicleNumber!==false ? bus.vehicleNumber?.match(/(\d{4})\s*$/)?.[1] : undefined;
      return `${index ? '다음 ' : ''}${time}${stops}${lastFour ? ` ${lastFour}` : ''}`;
    });
    return `${alert.busNumber}번 버스\n${lines.join('\n')}`;
  }
  const groups = groupBusArrivals(arrivals);
  if (!groups.length) return '현재 도착정보가 없습니다. 알림을 눌러 다시 확인하세요.';
  const summary = groups.slice(0,8).map(group => `${group.busNumber}번 ${formatEta(group.first.etaSeconds,group.first.serviceStatus,group.first.etaPrecision,group.first.etaSource)}`).join(' · ');
  return summary + (groups.length > 8 ? ` · 외 ${groups.length - 8}개 노선` : '');
}

/** 5분의 재진입 간격은 GPS 경계 흔들림에 의한 반복 알림을 막는다. */
export function shouldNotifyVisit(state:{inside?:boolean;lastSent?:number},now:number) {
  return !state.inside && (state.lastSent === undefined || now-state.lastSent >= 5*60_000);
}
