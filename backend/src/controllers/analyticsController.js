'use strict';

const mongoose = require('mongoose');
const Queue = require('../models/Queue');
const Counter = require('../models/Counter');
const Service = require('../models/Service');
const QueueEvent = require('../models/QueueEvent');
const { Token } = require('../models/Token');
const FootfallEvent = require('../models/FootfallEvent');
const ServiceCenter = require('../models/ServiceCenter');
const { buildCrowdState } = require('../utils/crowdMetrics');
const recommendationService = require('../services/recommendationService');
const queueService = require('../services/queueService');
const waitTimeService = require('../services/waitTimeService');
const queueMetricsService = require('../services/queueMetricsService');
const { mlPredictorService } = require('../services/mlPredictorService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNotFound, sendBadRequest, sendForbidden } = require('../utils/apiResponse');
const { getTodayDateString } = require('../utils/tokenUtils');

/**
 * GET /api/analytics/:centerId
 * Main analytics endpoint for admin dashboard.
 * Returns all data needed for charts, stat pills, and recommendations.
 */
const getDashboard = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  const centerObjectId = mongoose.Types.ObjectId.isValid(centerId)
    ? new mongoose.Types.ObjectId(centerId)
    : null;

  if (!centerObjectId) {
    return sendNotFound(res, 'Service center not found');
  }

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const yesterdayStart = new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayEnd = startOfDay;

  const [
    center,
    counters,
    services,
    recommendations,
    metrics,
    yesterdayIssued,
    yesterdayServed,
    yesterdayWaitAgg,
  ] = await Promise.all([
    ServiceCenter.findById(centerObjectId).lean({ virtuals: true }),
    Counter.find({ centerId: centerObjectId })
      .populate('serviceId', 'name tokenPrefix')
      .populate('currentTokenId', 'tokenCode status calledAt servingAt')
      .sort({ number: 1 })
      .lean({ virtuals: true }),
    Service.find({ centerId: centerObjectId, isActive: true })
      .sort({ order: 1, name: 1 })
      .lean(),
    recommendationService.getRecommendations(centerId),
    queueMetricsService.getLiveQueueMetrics(centerObjectId, { now }),
    Token.countDocuments({
      centerId: centerObjectId,
      createdAt: { $gte: yesterdayStart, $lt: yesterdayEnd },
    }),
    Token.countDocuments({
      centerId: centerObjectId,
      status: 'COMPLETED',
      completedAt: { $gte: yesterdayStart, $lt: yesterdayEnd },
    }),
    Token.aggregate([
      {
        $match: {
          centerId: centerObjectId,
          createdAt: { $gte: yesterdayStart, $lt: yesterdayEnd },
          calledAt: { $ne: null },
        },
      },
      {
        $project: {
          waitTimeSeconds: {
            $divide: [{ $subtract: ['$calledAt', '$createdAt'] }, 1000],
          },
        },
      },
      { $match: { waitTimeSeconds: { $gte: 0 } } },
      {
        $group: {
          _id: null,
          avgWaitSeconds: { $avg: '$waitTimeSeconds' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  if (!center) return sendNotFound(res, 'Service center not found');

  // Authoritative crowd state (occupancy, percentage, status, freshness).
  const crowd = buildCrowdState(center);

  // ── Stat pills & Live counts (authoritative Token-derived, scoped to selected center & today) ──
  const activeCounters = counters.filter((c) => c.status === 'ACTIVE').length;
  const closedCounters = counters.filter((c) => c.status === 'CLOSED').length;
  const avgWaitSeconds = metrics.avgWaitSeconds;

  // Real historical comparison trends (only when enough historical comparison data exists)
  const issuedTrend = yesterdayIssued > 0
    ? Math.round(((metrics.issuedToday - yesterdayIssued) / yesterdayIssued) * 100)
    : null;
  const completedTrend = yesterdayServed > 0
    ? Math.round(((metrics.completedToday - yesterdayServed) / yesterdayServed) * 100)
    : null;
  const yesterdayAvgWait = yesterdayWaitAgg[0]?.avgWaitSeconds ?? null;
  const waitTrend = yesterdayAvgWait !== null && typeof avgWaitSeconds === 'number'
    ? Math.round(((avgWaitSeconds - yesterdayAvgWait) / yesterdayAvgWait) * 100)
    : null;

  // ── Service demand breakdown (real tokens requested today, grouped by service) ──
  const serviceTokenAgg = await Token.aggregate([
    {
      $match: {
        centerId: centerObjectId,
        createdAt: { $gte: startOfDay, $lt: endOfDay },
      },
    },
    {
      $group: {
        _id: '$serviceId',
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
        },
        waiting: {
          $sum: { $cond: [{ $eq: ['$status', 'WAITING'] }, 1, 0] },
        },
      },
    },
  ]);

  const serviceTokenMap = new Map();
  for (const row of serviceTokenAgg) {
    if (row._id) serviceTokenMap.set(row._id.toString(), row);
  }

  // ── Average Service Time per Service (real completed token lifecycle records) ──
  const serviceDurationsAgg = await Token.aggregate([
    {
      $match: {
        centerId: centerObjectId,
        status: 'COMPLETED',
        completedAt: { $gte: startOfDay, $lt: endOfDay },
      },
    },
    {
      $project: {
        serviceId: 1,
        serviceDurationSeconds: {
          $cond: [
            { $ne: ['$actualServiceSeconds', null] },
            '$actualServiceSeconds',
            {
              $cond: [
                { $and: [{ $ne: ['$completedAt', null] }, { $ne: ['$servingAt', null] }] },
                { $divide: [{ $subtract: ['$completedAt', '$servingAt'] }, 1000] },
                {
                  $cond: [
                    { $and: [{ $ne: ['$completedAt', null] }, { $ne: ['$calledAt', null] }] },
                    { $divide: [{ $subtract: ['$completedAt', '$calledAt'] }, 1000] },
                    null,
                  ],
                },
              ],
            },
          ],
        },
      },
    },
    { $match: { serviceDurationSeconds: { $gt: 0 } } },
    {
      $group: {
        _id: '$serviceId',
        avgServiceTimeSeconds: { $avg: '$serviceDurationSeconds' },
        totalServiceSeconds: { $sum: '$serviceDurationSeconds' },
        completedCount: { $sum: 1 },
      },
    },
  ]);

  const serviceDurationMap = new Map();
  let centerTotalServiceSeconds = 0;
  let centerCompletedServiceSamples = 0;

  for (const row of serviceDurationsAgg) {
    if (row._id) {
      serviceDurationMap.set(row._id.toString(), row);
      centerTotalServiceSeconds += row.totalServiceSeconds;
      centerCompletedServiceSamples += row.completedCount;
    }
  }

  const avgServiceSeconds = centerCompletedServiceSamples > 0
    ? Math.round(centerTotalServiceSeconds / centerCompletedServiceSamples)
    : null;

  // Build serviceDemand list dynamically using active services and actual token demand
  const demandList = services.map((s) => {
    const sId = s._id.toString();
    const tokenData = serviceTokenMap.get(sId);
    return {
      serviceId: s._id,
      name: s.name,
      prefix: s.tokenPrefix || '?',
      total: tokenData ? tokenData.total : 0,
      completed: tokenData ? tokenData.completed : 0,
      waiting: tokenData ? tokenData.waiting : 0,
    };
  });

  // Include any other service referenced in today's tokens that might not be in active services
  for (const [sId, row] of serviceTokenMap.entries()) {
    if (!services.some((s) => s._id.toString() === sId)) {
      const extraSvc = await Service.findById(sId).select('name tokenPrefix').lean();
      demandList.push({
        serviceId: sId,
        name: extraSvc?.name || 'Other Service',
        prefix: extraSvc?.tokenPrefix || '?',
        total: row.total,
        completed: row.completed,
        waiting: row.waiting,
      });
    }
  }

  // Sort services: services with token demand first, then by name
  demandList.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  // Build queues status array with real service time and token counts
  const queuesStatus = services.map((s) => {
    const sId = s._id.toString();
    const tokenData = serviceTokenMap.get(sId);
    const durationData = serviceDurationMap.get(sId);
    return {
      service: {
        _id: s._id,
        name: s.name,
        tokenPrefix: s.tokenPrefix,
      },
      status: s.isActive ? 'OPEN' : 'CLOSED',
      waitingCount: tokenData ? tokenData.waiting : 0,
      completedCount: durationData ? durationData.completedCount : (tokenData ? tokenData.completed : 0),
      totalIssued: tokenData ? tokenData.total : 0,
      avgServiceTimeSeconds: durationData ? Math.round(durationData.avgServiceTimeSeconds) : null,
    };
  });

  // ── Counter utilization (operational activity scoped to selected center and date) ──
  const counterTokenAgg = await Token.aggregate([
    {
      $match: {
        centerId: centerObjectId,
        counterId: { $ne: null },
        $or: [
          { completedAt: { $gte: startOfDay, $lt: endOfDay } },
          { calledAt: { $gte: startOfDay, $lt: endOfDay } },
          { status: { $in: ['CALLED', 'SERVING'] } },
        ],
      },
    },
    {
      $project: {
        counterId: 1,
        status: 1,
        actualServiceSeconds: {
          $cond: [
            { $ne: ['$actualServiceSeconds', null] },
            '$actualServiceSeconds',
            {
              $cond: [
                { $and: [{ $ne: ['$completedAt', null] }, { $ne: ['$servingAt', null] }] },
                { $divide: [{ $subtract: ['$completedAt', '$servingAt'] }, 1000] },
                {
                  $cond: [
                    { $and: [{ $ne: ['$completedAt', null] }, { $ne: ['$calledAt', null] }] },
                    { $divide: [{ $subtract: ['$completedAt', '$calledAt'] }, 1000] },
                    0,
                  ],
                },
              ],
            },
          ],
        },
        earliestActivityTime: {
          $ifNull: ['$servingAt', { $ifNull: ['$calledAt', '$createdAt'] }],
        },
      },
    },
    {
      $group: {
        _id: '$counterId',
        served: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
        },
        activeCount: {
          $sum: { $cond: [{ $in: ['$status', ['CALLED', 'SERVING']] }, 1, 0] },
        },
        totalServiceSeconds: { $sum: '$actualServiceSeconds' },
        earliestActivity: { $min: '$earliestActivityTime' },
      },
    },
  ]);

  const counterTokenMap = new Map();
  for (const row of counterTokenAgg) {
    if (row._id) counterTokenMap.set(row._id.toString(), row);
  }

  const counterUtil = counters.map((c) => {
    const cId = c._id.toString();
    const row = counterTokenMap.get(cId);

    const served = row ? row.served : 0;
    const activeCount = row ? row.activeCount : (c.currentTokenId ? 1 : 0);

    // If currently serving a token, add live elapsed service seconds
    let currentServingSeconds = 0;
    if (c.currentTokenId) {
      const serveStart = c.servingStartedAt || c.currentTokenId?.servingAt || c.currentTokenId?.calledAt || c.updatedAt;
      if (serveStart) {
        currentServingSeconds = Math.max(0, Math.round((now.getTime() - new Date(serveStart).getTime()) / 1000));
      }
    }

    const totalServiceSeconds = (row ? row.totalServiceSeconds : 0) + currentServingSeconds;
    const avgServiceSec = served > 0 ? Math.round(totalServiceSeconds / served) : null;

    // Operational utilization calculation:
    // If the counter is CLOSED and has zero operational activity/served tokens today, utilization is unavailable (null)
    let utilizationPercent = null;
    if (c.status === 'CLOSED' && served === 0 && activeCount === 0 && (!c.activeMinutesToday || c.activeMinutesToday === 0)) {
      utilizationPercent = null;
    } else {
      // Counter is active or has operating history today
      let operatingSeconds = 0;
      if (c.activeMinutesToday && c.activeMinutesToday > 0) {
        operatingSeconds = c.activeMinutesToday * 60;
      } else if (row?.earliestActivity) {
        operatingSeconds = Math.max(totalServiceSeconds, Math.round((now.getTime() - new Date(row.earliestActivity).getTime()) / 1000));
      } else {
        // Fallback operating time based on current activity
        operatingSeconds = Math.max(totalServiceSeconds, 1);
      }

      if (operatingSeconds > 0) {
        utilizationPercent = Math.min(100, Math.round((totalServiceSeconds / Math.max(totalServiceSeconds, operatingSeconds)) * 100));
      } else {
        utilizationPercent = 0;
      }

      // If counter was active and processed customers, ensure non-zero utilization
      if (served > 0 && utilizationPercent === 0) {
        utilizationPercent = 1;
      }
    }

    return {
      counterId: c._id,
      name: c.name,
      number: c.number,
      status: c.status,
      served,
      utilizationPercent,
      avgServiceSeconds: avgServiceSec,
      currentToken: c.currentTokenId,
      service: c.serviceId,
    };
  });

  // ── Footfall chart — hourly buckets for today ───────────────────────────────
  const hourlyFootfall = await _getHourlyFootfall(centerObjectId, startOfDay, endOfDay);

  // ── Ghost Queue Geofencing (Tier 4 / Feature 1) ──────────────────────────────
  const activeTokens = await Token.find({
    centerId: centerObjectId,
    status: { $in: ['WAITING', 'CALLED', 'SERVING'] },
  }).select('proximityState').lean();

  let remoteCustomers = 0;
  let approachingCustomers = 0;
  let nearCenter = 0;
  let atCenter = 0;
  let unknownProximity = 0;

  for (const t of activeTokens) {
    if (t.proximityState === 'INSIDE') atCenter++;
    else if (t.proximityState === 'NEAR') nearCenter++;
    else if (t.proximityState === 'APPROACHING') approachingCustomers++;
    else if (t.proximityState === 'OUTSIDE') remoteCustomers++;
    else unknownProximity++;
  }

  const ghostQueue = {
    enabled: Boolean(
      center.geofence?.enabled &&
      center.location?.latitude != null &&
      center.location?.longitude != null
    ),
    locationConfigured: Boolean(
      center.location?.latitude != null &&
      center.location?.longitude != null
    ),
    radiusMeters: center.geofence?.radiusMeters || null,
    remoteCustomers,
    approachingCustomers,
    nearCenter,
    atCenter,
    unknownProximity,
  };

  return sendSuccess(res, {
    data: {
      summary: {
        totalWaiting: metrics.waitingCount,
        totalServed: metrics.completedToday,
        totalIssued: metrics.issuedToday,
        activeCounters,
        closedCounters,
        totalCounters: counters.length,
        ...crowd,
        // ── Authoritative live stat-pill values (Token-derived, scoped to today) ──
        waitingCount: metrics.waitingCount,
        servingCount: metrics.servingCount,
        completedToday: metrics.completedToday,
        issuedToday: metrics.issuedToday,
        waitSampleCount: metrics.waitSampleCount,
        avgWaitSeconds,
        avgServiceSeconds,
        trends: {
          issuedTrend,
          completedTrend,
          waitTrend,
        },
        ghostQueue,
      },
      queues: queuesStatus,
      counters: counterUtil,
      hourlyFootfall,
      serviceDemand: demandList,
      recommendations,
      ghostQueue,
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
    if (['CANCELLED', 'SKIPPED', 'EXPIRED', 'SKIPPED_OUT_OF_RANGE'].includes(token.status)) {
      byHour[key].cancelled++;
    }
  }

  const series = Object.values(byHour).sort((a, b) => a.hour.localeCompare(b.hour));

  return sendSuccess(res, { data: { series } });
});

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _getHourlyFootfall(centerId, startOfDay, endOfDay) {
  if (!startOfDay || !endOfDay) {
    const now = new Date();
    startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  }

  const events = await FootfallEvent.find({
    centerId,
    createdAt: { $gte: startOfDay, $lt: endOfDay },
  })
    .sort({ createdAt: 1 })
    .lean();

  if (!events || events.length === 0) {
    return [];
  }

  // Group by hour
  const byHour = {};
  for (const ev of events) {
    const hour = new Date(ev.createdAt).getHours();
    if (!byHour[hour]) {
      byHour[hour] = { hour, count: 0, entries: 0, exits: 0, peakCount: 0, observations: 0 };
    }
    if (ev.type === 'ENTRY') byHour[hour].entries++;
    if (ev.type === 'EXIT') byHour[hour].exits++;
    if (ev.type === 'COUNT') byHour[hour].observations++;
    byHour[hour].peakCount = Math.max(byHour[hour].peakCount, ev.countAfter || 0);
  }

  return Object.entries(byHour)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([hour, data]) => {
      const count = data.entries > 0 ? data.entries : data.peakCount;
      return {
        hour: `${String(hour).padStart(2, '0')}:00`,
        count,
        entries: data.entries,
        exits: data.exits,
        peakCount: data.peakCount,
        observations: data.observations,
      };
    });
}

/**
 * GET /api/analytics/:centerId/operational-overview
 * Centralized Resource Hub live operational overview for a service center. Admin only.
 */
const getOperationalOverview = asyncHandler(async (req, res) => {
  const { centerId } = req.params;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to access operational overview for this center');
  }

  const center = await ServiceCenter.findById(centerId).lean({ virtuals: true });
  if (!center) return sendNotFound(res, 'Service center not found');

  // Authoritative crowd state (occupancy, percentage, status, freshness).
  // Derived centrally because a lean query cannot produce schema virtuals.
  const crowd = buildCrowdState(center);

  const [counters, services, recentEvents] = await Promise.all([
    Counter.find({ centerId })
      .populate('serviceId', 'name tokenPrefix avgServiceTimeMinutes')
      .populate('staffId', 'name email role')
      .populate('currentTokenId', 'tokenCode tokenNumber status calledAt servingAt')
      .sort({ number: 1 })
      .lean({ virtuals: true }),
    Service.find({ centerId, isActive: true })
      .sort({ order: 1, name: 1 })
      .lean(),
    QueueEvent.find({ centerId })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('performedBy', 'name role')
      .lean(),
  ]);

  // Aggregate live queues across active services.
  // Tier 3 / Feature 1: `queueService.getQueueStatus(centerId)` returns the
  // array of live queues for the whole center (it does not take a serviceId).
  // The per-service view below therefore joins that real array by serviceId and
  // reads the server-authoritative context-aware EWT from it. No new analytics
  // engine is created here and no value is computed in this controller.
  const centerQueues = await queueService.getQueueStatus(centerId);
  const queueByServiceId = new Map(
    centerQueues
      .filter((q) => q.service && q.service._id)
      .map((q) => [q.service._id.toString(), q])
  );

  const queuesStatus = services.map((svc) => {
    const q = queueByServiceId.get(svc._id.toString());
    return {
      serviceId: svc._id,
      name: svc.name,
      tokenPrefix: svc.tokenPrefix,
      waitingCount: q ? q.waitingCount || 0 : 0,
      servingCount: q ? q.activeCount || 0 : 0,
      completedCount: q ? q.completedCount || 0 : 0,
      estimatedWaitMinutes: q ? q.estimatedWaitMinutes || 0 : 0,
      activeCounters: q ? q.counters.filter((c) => c.status === 'ACTIVE').length : 0,
    };
  });

  // Operational metrics
  const totalCounters = counters.length;
  const activeCounters = counters.filter((c) => c.status === 'ACTIVE').length;
  const idleCounters = counters.filter((c) => c.status === 'ACTIVE' && !c.currentTokenId).length;
  const servingCounters = counters.filter(
    (c) => c.status === 'ACTIVE' && c.currentTokenId && c.currentTokenId.status === 'SERVING'
  ).length;
  const calledCounters = counters.filter(
    (c) => c.status === 'ACTIVE' && c.currentTokenId && c.currentTokenId.status === 'CALLED'
  ).length;
  const breakCounters = counters.filter((c) => c.status === 'BREAK').length;
  const closedCounters = counters.filter((c) => c.status === 'CLOSED').length;

  const totalWaiting = queuesStatus.reduce((acc, q) => acc + q.waitingCount, 0);
  const totalServing = queuesStatus.reduce((acc, q) => acc + q.servingCount, 0);
  const queuesWithWait = queuesStatus.filter((q) => q.waitingCount > 0 && q.estimatedWaitMinutes);
  const avgWaitMinutes = queuesWithWait.length > 0
    ? Math.round(queuesWithWait.reduce((acc, q) => acc + q.estimatedWaitMinutes, 0) / queuesWithWait.length)
    : 0;

  // Formatted counter status list
  const nowMs = Date.now();
  const counterOverview = counters.map((c) => {
    let servingElapsedSeconds = 0;
    if (c.servingStartedAt) {
      servingElapsedSeconds = Math.max(0, Math.round((nowMs - new Date(c.servingStartedAt).getTime()) / 1000));
    } else if (c.currentTokenId?.servingAt) {
      servingElapsedSeconds = Math.max(0, Math.round((nowMs - new Date(c.currentTokenId.servingAt).getTime()) / 1000));
    }

    return {
      _id: c._id,
      name: c.name,
      number: c.number,
      status: c.status,
      displayLabel: c.displayLabel || c.name,
      service: c.serviceId
        ? {
            _id: c.serviceId._id,
            name: c.serviceId.name,
            tokenPrefix: c.serviceId.tokenPrefix,
            avgServiceTimeMinutes: c.serviceId.avgServiceTimeMinutes,
          }
        : null,
      staff: c.staffId
        ? {
            _id: c.staffId._id,
            name: c.staffId.name,
            email: c.staffId.email,
          }
        : null,
      currentToken: c.currentTokenId
        ? {
            _id: c.currentTokenId._id,
            tokenCode: c.currentTokenId.tokenCode,
            tokenNumber: c.currentTokenId.tokenNumber,
            status: c.currentTokenId.status,
            calledAt: c.currentTokenId.calledAt,
            servingAt: c.currentTokenId.servingAt,
          }
        : null,
      servingElapsedSeconds,
      servingStartedAt: c.servingStartedAt,
      stats: c.stats || { served: 0, skipped: 0, avgServiceSeconds: null },
      utilizationPercent: c.utilizationPercent || 0,
    };
  });

  // ── Ghost Queue Geofencing (Tier 4 / Feature 1) ──────────────────────────────
  // Exposes aggregate counts only; zero customer PII or raw GPS coordinates
  const activeTokens = await Token.find({
    centerId,
    status: { $in: ['WAITING', 'CALLED', 'SERVING'] },
  }).select('proximityState').lean();

  let remoteCustomers = 0;
  let approachingCustomers = 0;
  let nearCenter = 0;
  let atCenter = 0;
  let unknownProximity = 0;

  for (const t of activeTokens) {
    if (t.proximityState === 'INSIDE') atCenter++;
    else if (t.proximityState === 'NEAR') nearCenter++;
    else if (t.proximityState === 'APPROACHING') approachingCustomers++;
    else if (t.proximityState === 'OUTSIDE') remoteCustomers++;
    else unknownProximity++;
  }

  const ghostQueue = {
    enabled: Boolean(
      center.geofence?.enabled &&
      center.location?.latitude != null &&
      center.location?.longitude != null
    ),
    locationConfigured: Boolean(
      center.location?.latitude != null &&
      center.location?.longitude != null
    ),
    radiusMeters: center.geofence?.radiusMeters || null,
    remoteCustomers,
    approachingCustomers,
    nearCenter,
    atCenter,
    unknownProximity,
  };

  return sendSuccess(res, {
    data: {
      center: {
        _id: center._id,
        name: center.name,
        code: center.code,
        type: center.type,
        isOpen: center.isOpen,
        capacity: center.capacity,
        ...crowd,
      },
      metrics: {
        totalCounters,
        activeCounters,
        idleCounters,
        servingCounters,
        calledCounters,
        breakCounters,
        closedCounters,
        totalWaiting,
        totalServing,
        totalCalled: calledCounters,
        avgWaitMinutes,
        ghostQueue,
      },
      counters: counterOverview,
      services: queuesStatus,
      ghostQueue,
      recentEvents: recentEvents.map((e) => ({
        _id: e._id,
        eventType: e.eventType,
        metadata: e.metadata,
        performedBy: e.performedBy ? { _id: e.performedBy._id, name: e.performedBy.name, role: e.performedBy.role } : null,
        createdAt: e.createdAt,
      })),
    },
  });
});

/**
 * GET /api/analytics/:centerId/ewt
 * Tier 3 / Feature 1 — Context-Aware EWT with full explainability metadata.
 * ADMIN only. Every value returned is a real backend-derived number; nothing
 * is estimated, sampled or invented on the client.
 */
const getWaitTimeIntelligence = asyncHandler(async (req, res) => {
  const { centerId } = req.params;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to view wait-time intelligence for this center');
  }

  const center = await ServiceCenter.findById(centerId)
    .select('name code type isOpen capacity currentCrowd noShowTimeoutSeconds')
    .lean({ virtuals: true });
  if (!center) return sendNotFound(res, 'Service center not found');

  // Authoritative crowd state (occupancy, percentage, status, freshness).
  // Derived centrally because a lean query cannot produce schema virtuals.
  const crowd = buildCrowdState(center);

  const services = await Service.find({ centerId }).sort({ order: 1, name: 1 }).lean();
  const queues = await queueService.getQueueStatus(centerId);

  const now = new Date();
  const results = [];

  for (const svc of services) {
    const live = queues.find((q) => q.service && q.service._id.toString() === svc._id.toString());
    const queueDepth = live ? live.waitingCount || 0 : 0;

    const { minutes, context } = await waitTimeService.estimateContextAwareWait({
      centerId,
      serviceId: svc._id,
      queue: live || null,
      service: svc,
      queueDepth,
      now,
    });

    results.push({
      serviceId: svc._id,
      name: svc.name,
      tokenPrefix: svc.tokenPrefix,
      isActive: svc.isActive,
      queueDepth,
      activeCounters: context.activeCounters,
      estimatedWaitMinutes: minutes,
      // Explainability metadata — internal/admin only, never sent to customers.
      context,
    });
  }

  return sendSuccess(res, {
    data: {
      center: {
        _id: center._id,
        name: center.name,
        code: center.code,
        type: center.type,
        isOpen: center.isOpen,
        capacity: center.capacity,
        ...crowd,
        noShowTimeoutSeconds: center.noShowTimeoutSeconds,
      },
      config: waitTimeService.CONFIG,
      services: results,
      generatedAt: now.toISOString(),
    },
  });
});

/**
 * Helper to build bounded date filter for historical reporting
 */
function _resolveDateBounds(timeRange = 'today', startDateParam, endDateParam) {
  const now = new Date();
  let startDate;
  let endDate = new Date(now.getTime() + 1000); // include current second

  if (timeRange === 'today') {
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
  } else if (timeRange === '7d') {
    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (timeRange === '30d') {
    startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (timeRange === 'custom' && startDateParam) {
    startDate = new Date(startDateParam);
    if (isNaN(startDate.getTime())) {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
    }
    if (endDateParam) {
      const parsedEnd = new Date(endDateParam);
      if (!isNaN(parsedEnd.getTime())) {
        endDate = parsedEnd;
      }
    }
  } else {
    // Default fallback: today
    startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
}

/**
 * GET /api/analytics/:centerId/historical
 * Bounded, aggregated historical & SLA performance report. Admin only.
 */
const getHistoricalReport = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  const {
    timeRange = 'today',
    startDate: startDateParam,
    endDate: endDateParam,
    serviceId,
    counterId,
    targetWaitMinutes,
    page = 1,
    limit = 20,
  } = req.query;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to view reports for this center');
  }

  const centerObjectId = new mongoose.Types.ObjectId(centerId);
  const { startDate, endDate } = _resolveDateBounds(timeRange, startDateParam, endDateParam);

  const match = {
    centerId: centerObjectId,
    createdAt: { $gte: startDate, $lte: endDate },
  };

  if (serviceId) {
    if (!mongoose.Types.ObjectId.isValid(serviceId)) return sendBadRequest(res, 'Invalid serviceId');
    match.serviceId = new mongoose.Types.ObjectId(serviceId);
  }

  if (counterId) {
    if (!mongoose.Types.ObjectId.isValid(counterId)) return sendBadRequest(res, 'Invalid counterId');
    match.counterId = new mongoose.Types.ObjectId(counterId);
  }

  // 1. Status count aggregation
  const statusCounts = await Token.aggregate([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const countsMap = {};
  for (const s of statusCounts) {
    countsMap[s._id] = s.count;
  }

  const totalIssued = statusCounts.reduce((acc, curr) => acc + curr.count, 0);
  const totalCompleted = countsMap.COMPLETED || 0;
  const totalSkipped = countsMap.SKIPPED || 0;
  const totalCancelled = countsMap.CANCELLED || 0;
  const totalExpired = countsMap.EXPIRED || 0;
  const totalWaiting = countsMap.WAITING || 0;
  const totalServing = countsMap.SERVING || 0;
  const totalCalled = countsMap.CALLED || 0;
  const completionRate = totalIssued > 0 ? Math.round((totalCompleted / totalIssued) * 100) : 0;

  // 2. Wait times and service durations aggregation
  const timingAgg = await Token.aggregate([
    {
      $match: {
        ...match,
        $or: [
          { status: 'COMPLETED' },
          { calledAt: { $ne: null } },
        ],
      },
    },
    {
      $project: {
        waitTimeSeconds: {
          $cond: [
            { $ne: ['$calledAt', null] },
            { $divide: [{ $subtract: ['$calledAt', '$createdAt'] }, 1000] },
            null,
          ],
        },
        serviceDurationSeconds: {
          $cond: [
            { $ne: ['$actualServiceSeconds', null] },
            '$actualServiceSeconds',
            {
              $cond: [
                {
                  $and: [{ $ne: ['$completedAt', null] }, { $ne: ['$servingAt', null] }],
                },
                { $divide: [{ $subtract: ['$completedAt', '$servingAt'] }, 1000] },
                null,
              ],
            },
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        avgWaitSeconds: { $avg: '$waitTimeSeconds' },
        minWaitSeconds: { $min: '$waitTimeSeconds' },
        maxWaitSeconds: { $max: '$waitTimeSeconds' },
        avgServiceSeconds: { $avg: '$serviceDurationSeconds' },
      },
    },
  ]);

  const timing = timingAgg[0] || {
    avgWaitSeconds: null,
    minWaitSeconds: null,
    maxWaitSeconds: null,
    avgServiceSeconds: null,
  };

  // 3. Counter utilization breakdown
  const counterUtilAgg = await Token.aggregate([
    {
      $match: {
        ...match,
        counterId: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$counterId',
        totalHandled: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
        },
        skipped: {
          $sum: {
            $cond: [{ $in: ['$status', ['SKIPPED', 'SKIPPED_OUT_OF_RANGE']] }, 1, 0],
          },
        },
        skippedOutOfRange: {
          $sum: { $cond: [{ $eq: ['$status', 'SKIPPED_OUT_OF_RANGE'] }, 1, 0] },
        },
        avgServiceSeconds: { $avg: '$actualServiceSeconds' },
      },
    },
  ]);

  const counterIds = counterUtilAgg.map((c) => c._id);
  const countersInfo = await Counter.find({ _id: { $in: counterIds } })
    .select('name number')
    .lean();
  const counterInfoMap = {};
  for (const c of countersInfo) {
    counterInfoMap[c._id.toString()] = c;
  }

  const counterUtilization = counterUtilAgg.map((cu) => {
    const c = counterInfoMap[cu._id.toString()] || {};
    return {
      counterId: cu._id,
      name: c.name || `Counter ${c.number || '?' }`,
      number: c.number || null,
      totalHandled: cu.totalHandled,
      completed: cu.completed,
      skipped: cu.skipped,
      avgServiceSeconds: cu.avgServiceSeconds ? Math.round(cu.avgServiceSeconds) : null,
    };
  });

  // 4. Service performance breakdown
  const servicePerfAgg = await Token.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$serviceId',
        totalIssued: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
        },
        skipped: {
          $sum: {
            $cond: [{ $in: ['$status', ['SKIPPED', 'SKIPPED_OUT_OF_RANGE']] }, 1, 0],
          },
        },
        cancelled: {
          $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] },
        },
      },
    },
  ]);

  const serviceIds = servicePerfAgg.map((s) => s._id);
  const servicesInfo = await Service.find({ _id: { $in: serviceIds } })
    .select('name tokenPrefix avgServiceTimeMinutes')
    .lean();
  const serviceInfoMap = {};
  for (const s of servicesInfo) {
    serviceInfoMap[s._id.toString()] = s;
  }

  const servicePerformance = servicePerfAgg.map((sp) => {
    const s = serviceInfoMap[sp._id.toString()] || {};
    return {
      serviceId: sp._id,
      name: s.name || 'Unknown',
      tokenPrefix: s.tokenPrefix || '?',
      totalIssued: sp.totalIssued,
      completed: sp.completed,
      skipped: sp.skipped,
      cancelled: sp.cancelled,
    };
  });

  // 5. Time series aggregation
  const dateGroupFormat = timeRange === 'today' ? '%H:00' : '%Y-%m-%d';
  const timeSeriesAgg = await Token.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: dateGroupFormat, date: '$createdAt' } },
        created: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
        skipped: {
          $sum: {
            $cond: [{ $in: ['$status', ['SKIPPED', 'SKIPPED_OUT_OF_RANGE']] }, 1, 0],
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const timeSeries = timeSeriesAgg.map((item) => ({
    timeBucket: item._id,
    created: item.created,
    completed: item.completed,
    skipped: item.skipped,
  }));

  // 6. SLA Evaluation
  let sla;
  const parsedTarget = targetWaitMinutes ? parseInt(targetWaitMinutes, 10) : null;
  if (parsedTarget && parsedTarget > 0) {
    const targetSeconds = parsedTarget * 60;
    const compliantTokensAgg = await Token.aggregate([
      {
        $match: {
          ...match,
          status: 'COMPLETED',
          calledAt: { $ne: null },
        },
      },
      {
        $project: {
          waitTimeSeconds: { $divide: [{ $subtract: ['$calledAt', '$createdAt'] }, 1000] },
        },
      },
      {
        $match: {
          waitTimeSeconds: { $lte: targetSeconds },
        },
      },
      { $count: 'compliantCount' },
    ]);

    const compliantCount = compliantTokensAgg[0]?.compliantCount || 0;
    const compliancePercent = totalCompleted > 0 ? Math.round((compliantCount / totalCompleted) * 100) : 100;

    sla = {
      status: 'CONFIGURED',
      targetWaitMinutes: parsedTarget,
      totalCompleted,
      compliantCount,
      compliancePercent,
      note: `Evaluated against custom target SLA of ${parsedTarget} minutes.`,
    };
  } else {
    sla = {
      status: 'CONFIGURABLE',
      targetWaitMinutes: null,
      compliancePercent: null,
      note: 'SLA target is not configured for this service center. Provide targetWaitMinutes query parameter (e.g. ?targetWaitMinutes=15) to evaluate SLA compliance.',
    };
  }

  // 7. Paginated sanitized token history records
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skipCount = (pageNum - 1) * limitNum;

  const rawTokens = await Token.find(match)
    .sort({ createdAt: -1 })
    .skip(skipCount)
    .limit(limitNum)
    .populate('serviceId', 'name tokenPrefix')
    .populate('counterId', 'name number')
    .populate('servedBy', 'name email role')
    .lean();

  const tokens = rawTokens.map((t) => {
    let waitSeconds = null;
    if (t.calledAt) {
      waitSeconds = Math.max(0, Math.round((new Date(t.calledAt).getTime() - new Date(t.createdAt).getTime()) / 1000));
    }

    let serviceDurationSeconds = t.actualServiceSeconds || null;
    if (!serviceDurationSeconds && t.completedAt && t.servingAt) {
      serviceDurationSeconds = Math.max(0, Math.round((new Date(t.completedAt).getTime() - new Date(t.servingAt).getTime()) / 1000));
    }

    return {
      _id: t._id,
      tokenCode: t.tokenCode,
      tokenNumber: t.tokenNumber,
      status: t.status,
      serviceName: t.serviceId?.name || 'Unknown',
      tokenPrefix: t.serviceId?.tokenPrefix || '?',
      counterName: t.counterId?.name || (t.counterId?.number ? `Counter ${t.counterId.number}` : null),
      operatorName: t.servedBy?.name || null,
      waitSeconds,
      serviceDurationSeconds,
      createdAt: t.createdAt,
      calledAt: t.calledAt,
      servingAt: t.servingAt,
      completedAt: t.completedAt,
    };
  });

  return sendSuccess(res, {
    data: {
      timeRange,
      startDate,
      endDate,
      summary: {
        totalIssued,
        totalCompleted,
        totalSkipped,
        totalCancelled,
        totalExpired,
        totalWaiting,
        totalServing,
        totalCalled,
        completionRate,
      },
      timing: {
        avgWaitSeconds: timing.avgWaitSeconds ? Math.round(timing.avgWaitSeconds) : null,
        minWaitSeconds: timing.minWaitSeconds ? Math.round(timing.minWaitSeconds) : null,
        maxWaitSeconds: timing.maxWaitSeconds ? Math.round(timing.maxWaitSeconds) : null,
        avgServiceSeconds: timing.avgServiceSeconds ? Math.round(timing.avgServiceSeconds) : null,
      },
      sla,
      counterUtilization,
      servicePerformance,
      timeSeries,
      tokens,
      pagination: {
        total: totalIssued,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(totalIssued / limitNum) || 1,
      },
    },
  });
});

/**
 * GET /api/analytics/:centerId/historical/export
 * Export historical report data as CSV stream. Admin only.
 */
const exportHistoricalReport = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  const { timeRange = 'today', startDate: startDateParam, endDate: endDateParam, serviceId, counterId } = req.query;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to export reports for this center');
  }

  const { startDate, endDate } = _resolveDateBounds(timeRange, startDateParam, endDateParam);
  const match = {
    centerId: new mongoose.Types.ObjectId(centerId),
    createdAt: { $gte: startDate, $lte: endDate },
  };

  if (serviceId && mongoose.Types.ObjectId.isValid(serviceId)) {
    match.serviceId = new mongoose.Types.ObjectId(serviceId);
  }
  if (counterId && mongoose.Types.ObjectId.isValid(counterId)) {
    match.counterId = new mongoose.Types.ObjectId(counterId);
  }

  const tokens = await Token.find(match)
    .sort({ createdAt: -1 })
    .limit(5000)
    .populate('serviceId', 'name tokenPrefix')
    .populate('counterId', 'name number')
    .populate('servedBy', 'name')
    .lean();

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="queueflow_report_${centerId}_${Date.now()}.csv"`
  );

  res.write('Token Code,Token Number,Service,Counter,Operator,Status,Wait Time (min),Service Duration (min),Created At,Called At,Completed At\r\n');

  for (const t of tokens) {
    let waitMinutes = '';
    if (t.calledAt) {
      waitMinutes = ((new Date(t.calledAt).getTime() - new Date(t.createdAt).getTime()) / 60000).toFixed(1);
    }

    let serviceDurationMinutes = '';
    if (t.actualServiceSeconds) {
      serviceDurationMinutes = (t.actualServiceSeconds / 60).toFixed(1);
    } else if (t.completedAt && t.servingAt) {
      serviceDurationMinutes = ((new Date(t.completedAt).getTime() - new Date(t.servingAt).getTime()) / 60000).toFixed(1);
    }

    const serviceName = (t.serviceId?.name || '').replace(/"/g, '""');
    const counterName = (t.counterId?.name || (t.counterId?.number ? `Counter ${t.counterId.number}` : '')).replace(/"/g, '""');
    const operatorName = (t.servedBy?.name || '').replace(/"/g, '""');

    const row = [
      `"${t.tokenCode}"`,
      t.tokenNumber,
      `"${serviceName}"`,
      `"${counterName}"`,
      `"${operatorName}"`,
      t.status,
      waitMinutes,
      serviceDurationMinutes,
      `"${t.createdAt ? t.createdAt.toISOString() : ''}"`,
      `"${t.calledAt ? t.calledAt.toISOString() : ''}"`,
      `"${t.completedAt ? t.completedAt.toISOString() : ''}"`,
    ].join(',');

    res.write(row + '\r\n');
  }

  res.end();
});

/**
 * GET /api/analytics/:centerId/forecast
 * Tier 3 / Feature 2 — ML Footfall & Staffing Predictor
 * ADMIN only.
 * Bounded, reproducible, deterministic arrival forecast and advisory staffing
 * recommendation based solely on real historical tokens.
 */
const getDemandAndStaffingForecast = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  const { horizonHours, serviceId, refresh } = req.query;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to view forecasts for this center');
  }

  const forecast = await mlPredictorService.getForecast({
    centerId,
    serviceId: serviceId || null,
    horizonHours: horizonHours ? parseInt(horizonHours, 10) : undefined,
    forceRefresh: refresh === 'true' || refresh === '1',
  });

  return sendSuccess(res, { data: forecast });
});

// ─── Tier 4 / Feature 5: Cognitive Load / Workload Balancer Handlers ─────────

const workloadBalancerService = require('../services/workloadBalancerService');

/**
 * GET /api/analytics/:centerId/workload
 * Center-level operational workload distribution and unit states.
 * ADMIN and STAFF.
 */
const getCenterWorkload = asyncHandler(async (req, res) => {
  const { centerId } = req.params;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to view workload for this center');
  }

  const overview = await workloadBalancerService.getCenterWorkloadOverview(centerId);
  return sendSuccess(res, {
    message: 'Center operational workload overview retrieved',
    data: overview,
  });
});

/**
 * GET /api/analytics/:centerId/workload/operators
 * Granular workload scores, factors, and explanations for each counter/operator.
 * ADMIN and STAFF.
 */
const getOperatorWorkloads = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  const { serviceId } = req.query;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to view operator workloads for this center');
  }

  const overview = await workloadBalancerService.getCenterWorkloadOverview(centerId);
  let operators = overview.operatorWorkloads;
  if (serviceId) {
    operators = operators.filter(
      (w) => w.counter?.serviceId?.toString() === serviceId.toString()
    );
  }

  return sendSuccess(res, {
    message: 'Operator workloads retrieved',
    data: { operators, calculatedAt: overview.calculatedAt },
  });
});

/**
 * GET /api/analytics/:centerId/workload/me
 * Operator's own transparent operational workload score and factors.
 * STAFF and ADMIN.
 */
const getMyWorkload = asyncHandler(async (req, res) => {
  const { centerId } = req.params;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to access workload for this center');
  }

  const workload = await workloadBalancerService.calculateOperatorWorkload({
    operatorId: req.user._id,
    centerId,
  });

  return sendSuccess(res, {
    message: 'Operator workload profile retrieved',
    data: workload,
  });
});

/**
 * GET /api/analytics/:centerId/workload/recommendations
 * Operational workload balancing recommendations.
 * ADMIN and STAFF.
 */
const getWorkloadRecommendations = asyncHandler(async (req, res) => {
  const { centerId } = req.params;

  if (req.user.centerId && req.user.centerId.toString() !== centerId) {
    return sendForbidden(res, 'You are not authorized to view balancing recommendations for this center');
  }

  const result = await workloadBalancerService.getBalancingRecommendations(centerId);
  return sendSuccess(res, {
    message: 'Workload balancing recommendations retrieved',
    data: result,
  });
});

module.exports = {
  getDashboard,
  getTokenTimeSeries,
  getOperationalOverview,
  getWaitTimeIntelligence,
  getHistoricalReport,
  exportHistoricalReport,
  getDemandAndStaffingForecast,
  getCenterWorkload,
  getOperatorWorkloads,
  getMyWorkload,
  getWorkloadRecommendations,
};

