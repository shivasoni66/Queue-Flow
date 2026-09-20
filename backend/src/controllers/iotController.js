'use strict';

const { body } = require('express-validator');
const User = require('../models/User');
const ServiceCenter = require('../models/ServiceCenter');
const FootfallEvent = require('../models/FootfallEvent');
const { Token } = require('../models/Token');
const queueService = require('../services/queueService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendBadRequest, sendNotFound } = require('../utils/apiResponse');
const { emitToCenter } = require('../config/socket');

// ─── Validation ───────────────────────────────────
const rfidValidation = [
  body('uid').trim().notEmpty().withMessage('RFID UID is required'),
  body('centerId').isMongoId().withMessage('Valid centerId is required'),
];

const crowdValidation = [
  body('centerId').isMongoId().withMessage('Valid centerId is required'),
  body('type').isIn(['ENTRY', 'EXIT']).withMessage('Type must be ENTRY or EXIT'),
  body('sensorId').optional().isString(),
];

// ─── IoT Controllers ──────────────────────────────

/**
 * POST /api/iot/rfid
 * ESP32 sends an RFID UID. Look up the customer and return their profile.
 * Auth: x-iot-secret header
 */
const handleRfid = asyncHandler(async (req, res) => {
  const { uid, centerId } = req.body;

  const user = await User.findOne({ rfidUid: uid.toUpperCase() });

  if (!user) {
    return sendNotFound(res, 'No registered user found for this RFID card');
  }

  // Check if user has an active token at this center
  const activeToken = await Token.findOne({
    userId: user._id,
    centerId,
    status: { $in: ['WAITING', 'CALLED', 'SERVING'] },
  })
    .populate('serviceId', 'name tokenPrefix')
    .lean();

  return sendSuccess(res, {
    message: 'RFID verified',
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        rfidUid: user.rfidUid,
      },
      activeToken: activeToken || null,
    },
  });
});

/**
 * POST /api/iot/crowd
 * ESP32 sensor sends an ENTRY or EXIT event.
 * Updates service center currentCrowd and records FootfallEvent.
 * Auth: x-iot-secret header
 */
const handleCrowd = asyncHandler(async (req, res) => {
  const { centerId, type, sensorId, rawPayload } = req.body;

  const center = await ServiceCenter.findById(centerId);
  if (!center) return sendNotFound(res, 'Service center not found');

  // Update crowd count atomically
  const increment = type === 'ENTRY' ? 1 : -1;
  const updatedCenter = await ServiceCenter.findByIdAndUpdate(
    centerId,
    { $inc: { currentCrowd: increment } },
    { new: true }
  ).lean({ virtuals: true });

  // Ensure count doesn't go below 0
  if (updatedCenter.currentCrowd < 0) {
    await ServiceCenter.findByIdAndUpdate(centerId, { $set: { currentCrowd: 0 } });
    updatedCenter.currentCrowd = 0;
  }

  // Record the event
  const event = await FootfallEvent.create({
    centerId,
    type,
    countAfter: updatedCenter.currentCrowd,
    source: 'IOT',
    sensorId: sensorId || null,
    rawPayload: rawPayload || null,
  });

  // Emit real-time update to all admin/user listeners for this center
  emitToCenter(centerId.toString(), 'crowd.updated', {
    centerId,
    currentCrowd: updatedCenter.currentCrowd,
    crowdPercent: updatedCenter.crowdPercent,
    crowdStatus: updatedCenter.crowdStatus,
    capacity: updatedCenter.capacity,
    event: {
      type,
      sensorId,
      timestamp: event.createdAt,
    },
  });

  return sendSuccess(res, {
    message: `Crowd ${type} recorded`,
    data: {
      currentCrowd: updatedCenter.currentCrowd,
      crowdPercent: updatedCenter.crowdPercent,
      crowdStatus: updatedCenter.crowdStatus,
    },
  });
});

module.exports = { handleRfid, handleCrowd, rfidValidation, crowdValidation };
