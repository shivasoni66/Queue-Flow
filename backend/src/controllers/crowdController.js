'use strict';

const ServiceCenter = require('../models/ServiceCenter');
const FootfallEvent = require('../models/FootfallEvent');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNotFound } = require('../utils/apiResponse');
const { emitToCenter } = require('../config/socket');

/**
 * GET /api/crowd/:centerId
 * Get current crowd for a service center.
 */
const getCrowd = asyncHandler(async (req, res) => {
  const center = await ServiceCenter.findById(req.params.centerId)
    .select('name currentCrowd capacity capacityAlertThreshold')
    .lean({ virtuals: true });

  if (!center) return sendNotFound(res, 'Service center not found');

  return sendSuccess(res, {
    data: {
      centerId: center._id,
      name: center.name,
      currentCrowd: center.currentCrowd,
      capacity: center.capacity,
      crowdPercent: center.crowdPercent,
      crowdStatus: center.crowdStatus,
      capacityAlertThreshold: center.capacityAlertThreshold,
    },
  });
});

/**
 * GET /api/crowd/:centerId/history
 * Get recent footfall events for trending charts.
 */
const getHistory = asyncHandler(async (req, res) => {
  const { limit = 50, hours = 8 } = req.query;

  const since = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);

  const events = await FootfallEvent.find({
    centerId: req.params.centerId,
    createdAt: { $gte: since },
  })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .lean();

  return sendSuccess(res, { data: { events } });
});

module.exports = { getCrowd, getHistory };
