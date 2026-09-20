'use strict';

const Queue = require('../models/Queue');
const Counter = require('../models/Counter');
const ServiceCenter = require('../models/ServiceCenter');
const { Token } = require('../models/Token');
const { getTodayDateString } = require('../utils/tokenUtils');

/**
 * Generate smart operational recommendations from real database data.
 * These are evidence-based suggestions, not fake AI messages.
 *
 * @param {string} centerId
 * @returns {Promise<Array>} Array of recommendation objects
 */
async function getRecommendations(centerId) {
  const recommendations = [];

  const [center, queues, counters] = await Promise.all([
    ServiceCenter.findById(centerId).lean(),
    Queue.find({ centerId, date: getTodayDateString() })
      .populate('serviceId', 'name avgServiceTimeMinutes')
      .lean(),
    Counter.find({ centerId })
      .populate('serviceId', 'name')
      .populate('currentTokenId', 'tokenCode')
      .lean(),
  ]);

  if (!center) return recommendations;

  // 1. Crowd capacity alert
  const crowdPct = center.capacity > 0 ? (center.currentCrowd / center.capacity) * 100 : 0;
  if (crowdPct >= (center.capacityAlertThreshold || 80)) {
    recommendations.push({
      type: 'WARN',
      title: 'High crowd detected',
      desc: `Current crowd is ${center.currentCrowd} (${Math.round(crowdPct)}% of capacity ${center.capacity}). Consider managing entry flow.`,
      action: 'Review entry management',
      metric: { crowd: center.currentCrowd, capacity: center.capacity, crowdPct: Math.round(crowdPct) },
    });
  }

  // 2. Long queue — suggest opening more counters
  for (const queue of queues) {
    if (!queue.serviceId) continue;

    const waitingCount = queue.waitingCount || 0;
    const activeCounters = counters.filter(
      (c) =>
        c.serviceId &&
        c.serviceId._id.toString() === queue.serviceId._id.toString() &&
        c.status === 'ACTIVE'
    ).length;

    const avgServiceMin = queue.avgServiceTimeSeconds
      ? Math.ceil(queue.avgServiceTimeSeconds / 60)
      : queue.serviceId.avgServiceTimeMinutes || 8;

    const estimatedWait = activeCounters > 0
      ? Math.round((waitingCount / activeCounters) * avgServiceMin)
      : waitingCount * avgServiceMin;

    if (waitingCount > 10 && activeCounters < 2) {
      recommendations.push({
        type: 'WARN',
        title: `High queue for ${queue.serviceId.name}`,
        desc: `${waitingCount} people waiting with only ${activeCounters} active counter(s). Estimated wait: ${estimatedWait} min. Consider opening another counter.`,
        action: 'Open another counter',
        metric: { service: queue.serviceId.name, waiting: waitingCount, activeCounters, estimatedWait },
      });
    } else if (waitingCount > 5 && estimatedWait > 20) {
      recommendations.push({
        type: 'INFO',
        title: `Wait time increasing for ${queue.serviceId.name}`,
        desc: `Estimated wait is ${estimatedWait} min with ${waitingCount} people in queue. Monitor and consider extra counter.`,
        action: 'Monitor queue',
        metric: { service: queue.serviceId.name, waiting: waitingCount, estimatedWait },
      });
    }
  }

  // 3. Underutilized counter
  const activeCounters = counters.filter((c) => c.status === 'ACTIVE');
  for (const counter of activeCounters) {
    if (counter.stats && counter.stats.served < 3 && counter.stats.served !== undefined) {
      recommendations.push({
        type: 'SUGGEST',
        title: `${counter.name} has low activity`,
        desc: `Counter ${counter.name} has served only ${counter.stats.served} token(s) today. Consider reassigning to a high-demand service.`,
        action: 'Reassign counter',
        metric: { counter: counter.name, served: counter.stats.served },
      });
    }
  }

  // 4. All counters on break/closed — queue may stall
  const totalActive = counters.filter((c) => c.status === 'ACTIVE').length;
  const totalWaiting = queues.reduce((sum, q) => sum + (q.waitingCount || 0), 0);

  if (totalWaiting > 0 && totalActive === 0) {
    recommendations.push({
      type: 'WARN',
      title: 'No active counters',
      desc: `${totalWaiting} customer(s) are waiting but no counters are currently active. Please activate a counter.`,
      action: 'Activate a counter',
      metric: { totalWaiting, totalActive },
    });
  }

  return recommendations;
}

module.exports = { getRecommendations };
