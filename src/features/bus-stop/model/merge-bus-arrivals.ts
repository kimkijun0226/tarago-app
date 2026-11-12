import type { BusArrival } from '../api/get-bus-arrivals';

/** Keep authoritative vehicles and add usable supplementary vehicles for the same provider and stop. */
export function mergeBusArrivals(
  official: BusArrival[] | undefined,
  observedAt: number,
  enriched: BusArrival[] | undefined,
  enrichedAt: number,
) {
  if (!official) return enriched;
  if (!enriched || Math.abs(observedAt - enrichedAt) >= 30_000) return official;
  const routeKey = (row: BusArrival) =>
    JSON.stringify([row.routeSource?.provider, row.routeSource?.stationId, row.routeId, row.stationSeq]);
  const byRoute = new Map<string, BusArrival[]>();
  for (const row of enriched) {
    const key = routeKey(row);
    const rows = byRoute.get(key) ?? [];
    rows.push(row);
    byRoute.set(key, rows);
  }
  const groups = new Map<string, BusArrival[]>();
  for (const row of official) {
    const key = routeKey(row);
    const rows = groups.get(key) ?? [];
    rows.push(row);
    groups.set(key, rows);
  }
  if (enrichedAt >= observedAt) {
    for (const [key, rows] of byRoute) {
      if (!groups.has(key)) groups.set(key, rows);
    }
  }
  // Completion time includes enrichment latency and must never add time to an ETA.
  const elapsed = Math.max(0, observedAt - enrichedAt) / 1000;
  return [...groups].flatMap(([key, rows]) => {
    const supplemental = byRoute.get(key) ?? [];
    const metadata = supplemental[0];
    const base = rows.map((row) => metadata ? {
      ...row,
      direction: row.direction ?? metadata.direction,
      nextStopName: row.nextStopName ?? metadata.nextStopName,
      routeStartName: row.routeStartName ?? metadata.routeStartName,
      routeEndName: row.routeEndName ?? metadata.routeEndName,
    } : row);
    if (base.some((row) => row.serviceEnded)) return base;
    const live = base.filter((row) => row.etaSeconds !== null);
    const ids = new Set(live.map((row) => row.vehicleId));
    if (live.length >= 2 || live.some((row) => !row.vehicleId)) return base;
    for (const row of supplemental) {
      if (row.etaSeconds === null || row.etaSource === 'schedule_estimate' || ids.has(row.vehicleId)) continue;
      if (elapsed >= 15 && base.some((officialRow) => officialRow.etaSeconds !== null)) continue;
      const remaining = row.etaSeconds - elapsed;
      if (remaining < 0) continue;
      live.push({ ...row, etaSeconds: remaining });
      ids.add(row.vehicleId);
      if (live.length === 2) break;
    }
    if (live.length) return live;
    return supplemental.length && enrichedAt >= observedAt ? supplemental : base;
  });
}
