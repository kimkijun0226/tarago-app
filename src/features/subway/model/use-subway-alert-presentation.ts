import { useState } from 'react';
import { useSubwayArrivals } from './use-subway-arrivals';
import { useSubwayStation, useSubwayTimetable } from './use-subway-station';
import { subwayDirectionPresentation } from './subway-direction';
import type { SubwayAlertInput } from './subway-alert';

/** 새 알림은 저장된 표시 정보를 쓰고, 기존 알림은 Query에서 인접역·행선지를 보완한다. */
export function useSubwayAlertPresentation(alert: SubwayAlertInput) {
  const missing = !alert.nextStationName || (!alert.destination && !alert.destinationNames?.length);
  const station = useSubwayStation(missing ? alert.stationName : '');
  const live = useSubwayArrivals(missing ? alert.stationName : '');
  const [openedAt] = useState(Date.now);
  const weekday = new Date(openedAt + 9 * 3600_000 - 3 * 3600_000).getUTCDay();
  const timetable = useSubwayTimetable(
    alert.stationName,
    alert.lineId,
    weekday === 6 ? 'saturday' : weekday === 0 ? 'holiday' : 'weekday',
    missing,
  );
  const line = station.data?.lines.find((l) => l.lineId === alert.lineId);
  const inferred = subwayDirectionPresentation(
    line ?? { lineId: alert.lineId, previousStation: null, nextStation: null },
    alert.direction,
    live.data?.arrivals ?? [],
    timetable.data?.directions,
  );
  return {
    ...alert,
    nextStationName: alert.nextStationName ?? inferred.nextStationName,
    destinationNames: alert.destinationNames?.length
      ? alert.destinationNames
      : inferred.destinationNames,
  };
}
