import { useEffect, useMemo, useState } from 'react';
import type { BusArrival } from '../api/get-bus-arrivals';

/** Age cached map readings without changing their Query timestamps. */
export function useCurrentBusArrivals(arrivals: BusArrival[], observedAt: number, visible = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!visible || !observedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [observedAt, visible]);

  return useMemo(() => {
    const age = Math.max(0, now - observedAt) / 1_000;
    return arrivals.map((arrival) => {
      if (arrival.etaSeconds === null || arrival.etaSource === 'schedule_estimate') return arrival;
      const remaining = arrival.etaSeconds - age;
      return { ...arrival, etaSeconds: age >= 90 || remaining < -15 ? null : Math.max(0, remaining) };
    });
  }, [arrivals, observedAt, now]);
}
