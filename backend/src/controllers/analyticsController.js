'use strict';

const Queue = require('../models/Queue');
const Counter = require('../models/Counter');
const { Token } = require('../models/Token');
const FootfallEvent = require('../models/FootfallEvent');
const ServiceCenter = require('../models/ServiceCenter');
const recommendationService = require('../services/recommendationService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNotFound } = require('../utils/apiResponse');
const { getTodayDateString } = require('../utils/tokenUtils');

/**
 * GET /api/analytics/:centerId
 * Main analytics endpoint for admin dashboard.
 * Returns all data needed for charts, stat pills, and recommendations.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  const date = getTodayDateString();

  const [center, queues, counters, recommendations] = await Promise.all([
    ServiceCenter.findById(centerId).lean({ virtuals: true }),
    Queue.find({ centerId, date }).populate('serviceId', 'name tokenPrefix').lean(),
    Counter.find({ centerId })
      .populate('serviceId', 'name')
      .populate('currentTokenId', 'tokenCode status')
      .lean({ virtuals: true }),
    recommendationService.getRecommendations(centerId),
  ]);

  if (!center) return sendNotFound(res, 'Service center not found');

  // ── Stat pills ──────────────────────────────────────────────────────────────
  const totalWaiting = queues.reduce((s, q) => s + (q.waitingCount || 0), 0);
  const totalServed  = queues.reduce((s, q) => s + (q.completedCount || 0), 0);
  const totalIssued  = queues.reduce((s, q) => s + (q.totalIssued || 0), 0);
  const activeCounters  = counters.filter((c) => c.status === 'ACTIVE').length;
  const closedCounters  = counters.filter((c) => c.status === 'CLOSED').length;

  // Average wait time across queues with real data
  const queuesWithAvg = queues.filter((q) => q.avgServiceTimeSeconds);
  const avgWaitSeconds = queuesWithAvg.length > 0
    ? Math.round(queuesWithAvg.reduce((s, q) => s + q.avgServiceTimeSeconds, 0) / queuesWithAvg.length)
    : null;

  // ── Footfall chart — hourly buckets for today ───────────────────────────────
  const hourlyFootfall = await _getHourlyFootfall(centerId, date);

  // ── Service demand — completed tokens by service ────────────────────────────
  const serviceDemand = queues.map((q) => ({
    serviceId: q.serviceId?._id,
    name: q.serviceId?.name || 'Unknown',
    prefix: q.serviceId?.tokenPrefix || '?',
    completed: q.completedCount || 0,
    waiting: q.waitingCount || 0,
    total: q.totalIssued || 0,
  }));

  // ── Counter utilization ─────────────────────────────────────────────────────
  const counterUtil = counters.map((c) => ({
    counterId: c._id,
    name: c.name,
    number: c.number,
    status: c.status,
    served: c.stats?.served || 0,
    utilizationPercent: c.utilizationPercent ?? 0,
    avgServiceSeconds: c.stats?.avgServiceSeconds || null,
    currentToken: c.currentTokenId,
    service: c.serviceId,
  }));

  return sendSuccess(res, {
    data: {
      summary: {
        totalWaiting,
        totalServed,
        totalIssued,
        activeCounters,
        closedCounters,
        totalCounters: counters.length,
        currentCrowd: center.currentCrowd,
        crowdPercent: center.crowdPercent,
        crowdStatus: center.crowdStatus,
        avgWaitSeconds,
      },
      queues: queues.map((q) => ({
        queueId: q._id,
        service: q.serviceId,
        status: q.status,
        waitingCount: q.waitingCount,
        completedCount: q.completedCount,
        abandonedCount: q.abandonedCount,
        totalIssued: q.totalIssued,
        avgServiceTimeSeconds: q.avgServiceTimeSeconds,
      })),
      counters: counterUtil,
      hourlyFootfall,
      serviceDemand,
      recommendations,
    },
  });
});

/**
 * GET /api/analytics/:centerId/tokens
 * Time-series token data for charts (tokens per hour).
 */
const getTokenTimeSeries = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  const { hours = 8 } = req.query;

  const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

  const tokens = await Token.find({
    centerId,
    createdAt: { $gte: since },
  })
    .select('createdAt status serviceId')
    .populate('serviceId', 'name')
    .lean();

  // Group by hour
  const byHour = {};
  for (const token of tokens) {
    const hour = new Date(token.createdAt).getHours();
    const key = `${hour}:00`;
    if (!byHour[key]) byHour[key] = { hour: key, created: 0, completed: 0, cancelled: 0 };
    byHour[key].created++;
    if (token.status === 'COMPLETED') byHour[key].completed++;
    if (['CANCELLED', 'SKIPPED', 'EXPIRED'].includes(token.status)) byHour[key].cancelled++;
  }

  const series = Object.values(byHour).sort((a, b) => a.hour.localeCompare(b.hour));

  return sendSuccess(res, { data: { series } });
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getHourlyFootfall(centerId, _date) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const events = await FootfallEvent.find({
    centerId,
    createdAt: { $gte: startOfDay },
  })
    .sort({ createdAt: 1 })
    .lean();

  // Group by hour
  const byHour = {};
  for (const ev of events) {
    const hour = new Date(ev.createdAt).getHours();
    if (!byHour[hour]) byHour[hour] = { hour, entries: 0, exits: 0, peakCount: 0 };
    if (ev.type === 'ENTRY') byHour[hour].entries++;
    if (ev.type === 'EXIT') byHour[hour].exits++;
    byHour[hour].peakCount = Math.max(byHour[hour].peakCount, ev.countAfter || 0);
  }

  return Object.entries(byHour)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([hour, data]) => ({
      hour: `${String(hour).padStart(2, '0')}:00`,
      entries: data.entries,
      exits: data.exits,
      peakCount: data.peakCount,
    }));
}

module.exports = { getDashboard, getTokenTimeSeries };
