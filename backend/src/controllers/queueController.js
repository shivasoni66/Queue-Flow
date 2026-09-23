'use strict';

const queueService = require('../services/queueService');
const Queue = require('../models/Queue');
const { Token } = require('../models/Token');
const { getTodayDateString } = require('../utils/tokenUtils');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNotFound } = require('../utils/apiResponse');

/**
 * GET /api/queue/:centerId
 * Get live queue status for all services at a center.
 * Public (customer app uses this to show waiting counts before joining).
 */
const getQueueStatus = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  const status = await queueService.getQueueStatus(centerId);
  return sendSuccess(res, { data: { queues: status } });
});

/**
 * GET /api/queue/:centerId/:serviceId
 * Get queue status for a specific service.
 */
const getServiceQueue = asyncHandler(async (req, res) => {
  const { centerId, serviceId } = req.params;
  const date = getTodayDateString();

  const queue = await Queue.findOne({ centerId, serviceId, date })
    .populate('serviceId', 'name tokenPrefix avgServiceTimeMinutes')
    .lean({ virtuals: true });

  // Get waiting tokens (first 5 for preview)
  const waitingTokens = await Token.find({ centerId, serviceId, status: 'WAITING' })
    .sort({ createdAt: 1 })
    .limit(5)
    .select('tokenCode currentPosition createdAt')
    .lean();

  const calledTokens = await Token.find({ centerId, serviceId, status: { $in: ['CALLED', 'SERVING'] } })
    .populate('counterId', 'name number')
    .select('tokenCode status counterId calledAt')
    .lean();

  return sendSuccess(res, {
    data: {
      queue: queue || { waitingCount: 0, completedCount: 0, totalIssued: 0, status: 'OPEN' },
      waitingTokens,
      calledTokens,
    },
  });
});

/**
 * GET /api/queue/:centerId/events
 * Get recent queue events for the live log (admin).
 */
const getRecentEvents = asyncHandler(async (req, res) => {
  const { centerId } = req.params;
  let limitNum = parseInt(req.query.limit, 10);
  if (isNaN(limitNum) || limitNum < 1) limitNum = 20;
  if (limitNum > 100) limitNum = 100;

  const QueueEvent = require('../models/QueueEvent');
  const events = await QueueEvent.find({ centerId })
    .populate('tokenId', 'tokenCode')
    .populate('counterId', 'name number')
    .populate('performedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(limitNum)
    .lean();

  return sendSuccess(res, { data: { events } });
});

module.exports = { getQueueStatus, getServiceQueue, getRecentEvents };
