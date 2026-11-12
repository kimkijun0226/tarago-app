import assert from 'node:assert/strict';
import test from 'node:test';
import type { BusArrival } from '../api/get-bus-arrivals';
import { mergeBusArrivals } from './merge-bus-arrivals.ts';

function bus(vehicleId: string | undefined, etaSeconds: number | null, routeId = '52'): BusArrival {
  return { routeId, busNumber: routeId, vehicleId, etaSeconds, stationSeq: 4,
    routeType: '', vehicleType: '', remainingStops: null,
    routeSource: { provider: 'GYEONGGI', stationId: 'stop' } };
}

test('keeps the official ETA and adds a distinct supplementary vehicle without adding latency', () => {
  const official = bus('A', 80);
  assert.deepEqual(mergeBusArrivals([official], 1_000, [bus('A', 91), bus('B', 120)], 3_000)
    ?.map((row) => [row.vehicleId, row.etaSeconds]), [['A', 80], ['B', 120]]);
});

test('uses a late supplier result and ages older supplementary readings', () => {
  assert.deepEqual(mergeBusArrivals([bus(undefined, null)], 4_000, [bus('A', 80)], 1_000)
    ?.map((row) => row.etaSeconds), [77]);
  assert.deepEqual(mergeBusArrivals([bus(undefined, null)], 21_000, [bus('A', 80)], 1_000)
    ?.map((row) => row.etaSeconds), [60]);
  assert.deepEqual(mergeBusArrivals([bus('A', 80)], 1_000, [bus('B', 120, '12')], 3_000)
    ?.map((row) => row.routeId), ['52', '12']);
});

test('never reuses expired data or supplements a different provider with the same route ID', () => {
  const official = bus(undefined, null);
  assert.deepEqual(mergeBusArrivals([official], 31_000, [bus('A', 80)], 1_000), [official]);
  const other = { ...bus('A', 80), routeSource: { provider: 'SEOUL' as const, stationId: 'stop' } };
  assert.deepEqual(mergeBusArrivals([official], 2_000, [other], 1_000), [official]);
});
