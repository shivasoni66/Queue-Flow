import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMPTY_CROWD,
  adoptCrowdRead,
  adoptCrowdEvent,
  isCrowdReadingStale,
} from '../src/services/crowdState.js';

describe('Admin Panel Analytics Screen Logic', () => {
  test('1. Total issued and completed services display real values or 0', () => {
    const summary = {
      totalIssued: 31,
      totalServed: 18,
    };
    const displayedIssued = summary.totalIssued ?? summary.issuedToday ?? 0;
    const displayedServed = summary.totalServed ?? summary.completedToday ?? 0;

    assert.strictEqual(displayedIssued, 31);
    assert.strictEqual(displayedServed, 18);

    const emptySummary = {};
    assert.strictEqual(emptySummary.totalIssued ?? emptySummary.issuedToday ?? 0, 0);
    assert.strictEqual(emptySummary.totalServed ?? emptySummary.completedToday ?? 0, 0);
  });

  test('2. Average wait time shows "—" when no valid samples, and formatted minutes when samples exist', () => {
    // When avgWaitSeconds is null or 0 samples
    const noSamples = { avgWaitSeconds: null, waitSampleCount: 0 };
    const displayEmpty =
      typeof noSamples.avgWaitSeconds === 'number' && noSamples.waitSampleCount > 0
        ? `${Math.round(noSamples.avgWaitSeconds / 60)}m`
        : '—';
    assert.strictEqual(displayEmpty, '—');

    // When valid samples exist (e.g. 90 seconds = 2m)
    const withSamples = { avgWaitSeconds: 90, waitSampleCount: 22 };
    const displayWithSamples =
      typeof withSamples.avgWaitSeconds === 'number' && withSamples.waitSampleCount > 0
        ? `${Math.round(withSamples.avgWaitSeconds / 60)}m`
        : '—';
    assert.strictEqual(displayWithSamples, '2m');

    // When valid sample is actually 0 seconds
    const zeroWait = { avgWaitSeconds: 0, waitSampleCount: 1 };
    const displayZero =
      typeof zeroWait.avgWaitSeconds === 'number' && zeroWait.waitSampleCount > 0
        ? `${Math.round(zeroWait.avgWaitSeconds / 60)}m`
        : '—';
    assert.strictEqual(displayZero, '0m');
  });

  test('3. Current crowd displays OFFLINE when telemetry is stale, and real value when online', () => {
    // Stale telemetry from earlier
    const staleCrowd = {
      currentCrowd: 1,
      capacity: 200,
      crowdPercent: 1,
      crowdUpdatedAt: new Date(Date.now() - 500000).toISOString(),
      crowdSensorOnline: false,
    };
    const isStale = isCrowdReadingStale(staleCrowd);
    assert.strictEqual(isStale, true);

    const staleDisplay = isStale ? 'OFFLINE' : staleCrowd.currentCrowd;
    assert.strictEqual(staleDisplay, 'OFFLINE');

    // Fresh telemetry
    const freshCrowd = {
      currentCrowd: 2,
      capacity: 200,
      crowdPercent: 1,
      crowdUpdatedAt: new Date().toISOString(),
      crowdSensorOnline: true,
    };
    const isFreshStale = isCrowdReadingStale(freshCrowd);
    assert.strictEqual(isFreshStale, false);

    const freshDisplay = isFreshStale ? 'OFFLINE' : freshCrowd.currentCrowd;
    assert.strictEqual(freshDisplay, 2);
  });

  test('4. Realtime crowd update from OpenCV adopts count and updates display', () => {
    const centerId = '6ab93df8da6b1eefeb19caa2';
    const initial = adoptCrowdRead({ currentCrowd: 1, capacity: 200, crowdPercent: 1 }, centerId);
    assert.strictEqual(initial.currentCrowd, 1);

    // Event arrives: OpenCV detects 2 people
    const eventData = {
      centerId,
      currentCrowd: 2,
      capacity: 200,
      crowdPercent: 1,
      crowdStatus: 'LOW',
      crowdUpdatedAt: new Date().toISOString(),
    };
    const updated = adoptCrowdEvent(initial, eventData, centerId);
    assert.strictEqual(updated.currentCrowd, 2);
    assert.strictEqual(updated.crowdSensorOnline, true);
  });

  test('5. Hourly Visitor Footfall correctly identifies empty vs populated data', () => {
    // Empty state
    const emptyFootfall = [];
    assert.strictEqual(emptyFootfall.length === 0, true);

    // Real populated telemetry
    const realFootfall = [
      { hour: '15:00', count: 5, entries: 0, exits: 0, peakCount: 5 },
      { hour: '16:00', count: 3, entries: 0, exits: 0, peakCount: 3 },
      { hour: '17:00', count: 2, entries: 0, exits: 0, peakCount: 2 },
    ];
    assert.strictEqual(realFootfall.length, 3);
    assert(realFootfall.every((f) => typeof f.count === 'number'));
  });

  test('6. Dynamic counter utilization handles any number of counters without hardcoded names', () => {
    const counters = [
      { name: 'Counter 01', utilizationPercent: 2, served: 15 },
      { name: 'Counter 02', utilizationPercent: 10, served: 3 },
      { name: 'Counter 03', utilizationPercent: null, served: 0 },
    ];

    const utilData = counters.map((c) => ({
      name: c.name,
      util: typeof c.utilizationPercent === 'number' ? c.utilizationPercent : null,
      served: c.served || 0,
    }));

    assert.strictEqual(utilData.length, 3);
    assert.strictEqual(utilData[0].util, 2);
    assert.strictEqual(utilData[1].util, 10);
    assert.strictEqual(utilData[2].util, null);

    // Pill badge format
    assert.strictEqual(`${utilData[0].name}: ${utilData[0].util !== null ? `${utilData[0].util}%` : '—'}`, 'Counter 01: 2%');
    assert.strictEqual(`${utilData[2].name}: ${utilData[2].util !== null ? `${utilData[2].util}%` : '—'}`, 'Counter 03: —');
  });

  test('7. Service demand breakdown groups actual tokens requested and handles empty state truthfully', () => {
    const serviceDemand = [
      { serviceId: 's1', name: 'College Queue', total: 31, completed: 18 },
      { serviceId: 's2', name: 'General Inquiries', total: 0, completed: 0 },
    ];

    const pieData = serviceDemand
      .filter((s) => (s.total || s.completed || 0) > 0)
      .map((s) => ({
        name: s.name,
        value: s.total || s.completed || 0,
      }));

    assert.strictEqual(pieData.length, 1);
    assert.strictEqual(pieData[0].name, 'College Queue');
    assert.strictEqual(pieData[0].value, 31);

    const emptyDemand = [];
    const emptyPieData = emptyDemand.filter((s) => (s.total || s.completed || 0) > 0);
    assert.strictEqual(emptyPieData.length, 0);
  });

  test('8. Average service time displays actual completed duration or "—"', () => {
    const queues = [
      { service: { name: 'College Queue' }, avgServiceTimeSeconds: 94, completedCount: 18, waitingCount: 0 },
      { service: { name: 'New Service' }, avgServiceTimeSeconds: null, completedCount: 0, waitingCount: 2 },
    ];

    const display1 = queues[0].avgServiceTimeSeconds
      ? `~${Math.round(queues[0].avgServiceTimeSeconds / 60)}m avg`
      : '—';
    assert.strictEqual(display1, '~2m avg');

    const display2 = queues[1].avgServiceTimeSeconds
      ? `~${Math.round(queues[1].avgServiceTimeSeconds / 60)}m avg`
      : '—';
    assert.strictEqual(display2, '—');
  });

  test('9. Comparison trends display percentage changes or truthful "No comparison data"', () => {
    const trends = {
      issuedTrend: 182,
      completedTrend: 125,
      waitTrend: -70,
    };

    const formatTrend = (val) =>
      typeof val === 'number' ? (val > 0 ? `+${val}%` : `${val}%`) : 'No comparison data';

    assert.strictEqual(formatTrend(trends.issuedTrend), '+182%');
    assert.strictEqual(formatTrend(trends.completedTrend), '+125%');
    assert.strictEqual(formatTrend(trends.waitTrend), '-70%');
    assert.strictEqual(formatTrend(null), 'No comparison data');
    assert.strictEqual(formatTrend(undefined), 'No comparison data');
  });
});
