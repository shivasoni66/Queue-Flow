'use strict';

/**
 * DEV SIMULATOR CONTROLLER
 *
 * These endpoints exist ONLY in development mode (NODE_ENV=development).
 * They simulate IoT hardware events using the SAME backend logic as real hardware.
 * They update real database state and emit real Socket.IO events.
 *
 * They are NOT available in production.
 * They must NOT be called from production mobile/web clients.
 * They do NOT fake UI data — they create real backend events.
 */

const ServiceCenter = require('../models/ServiceCenter');
const FootfallEvent = require('../models/FootfallEvent');
const User = require('../models/User');
const { Token } = require('../models/Token');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendNotFound, sendBadRequest } = require('../utils/apiResponse');
const { emitToCenter } = require('../config/socket');

/**
 * POST /api/dev/simulate/crowd
 * Simulate an IoT crowd entry or exit event.
 *
 * Body: { centerId, type: 'ENTRY'|'EXIT', count?: number }
 */
const simulateCrowd = asyncHandler(async (req, res) => {
  const { centerId, type, count = 1 } = req.body;

  if (!centerId) return sendBadRequest(res, 'centerId is required');
  if (!['ENTRY', 'EXIT'].includes(type)) return sendBadRequest(res, 'type must be ENTRY or EXIT');
  if (count < 1 || count > 50) return sendBadRequest(res, 'count must be 1–50');

  const center = await ServiceCenter.findById(centerId);
  if (!center) return sendNotFound(res, 'Service center not found');

  const increment = type === 'ENTRY' ? count : -count;
  const updatedCenter = await ServiceCenter.findByIdAndUpdate(
    centerId,
    { $inc: { currentCrowd: increment } },
    { new: true }
  ).lean({ virtuals: true });

  if (updatedCenter.currentCrowd < 0) {
    await ServiceCenter.findByIdAndUpdate(centerId, { $set: { currentCrowd: 0 } });
    updatedCenter.currentCrowd = 0;
  }

  // Create one FootfallEvent per unit
  const events = [];
  for (let i = 0; i < count; i++) {
    const ev = await FootfallEvent.create({
      centerId,
      type,
      countAfter: updatedCenter.currentCrowd,
      source: 'SIMULATOR',
      sensorId: 'DEV_SIM',
    });
    events.push(ev._id);
  }

  // Emit the same real-time event that hardware would produce
  emitToCenter(centerId.toString(), 'crowd.updated', {
    centerId,
    currentCrowd: updatedCenter.currentCrowd,
    crowdPercent: updatedCenter.crowdPercent,
    crowdStatus: updatedCenter.crowdStatus,
    capacity: updatedCenter.capacity,
    event: { type, sensorId: 'DEV_SIM', timestamp: new Date(), simulated: true },
  });

  return sendSuccess(res, {
    message: `[DEV] Simulated ${count} ${type} event(s)`,
    data: {
      currentCrowd: updatedCenter.currentCrowd,
      crowdPercent: updatedCenter.crowdPercent,
      crowdStatus: updatedCenter.crowdStatus,
      events,
    },
  });
});

/**
 * POST /api/dev/simulate/rfid
 * Simulate an RFID tap by providing a user email (instead of physical card).
 * Returns the same response as a real RFID tap would.
 *
 * Body: { email, centerId }
 */
const simulateRfid = asyncHandler(async (req, res) => {
  const { email, centerId } = req.body;

  if (!email) return sendBadRequest(res, 'email is required');

  const user = await User.findOne({ email });
  if (!user) return sendNotFound(res, 'User not found');

  const activeToken = await Token.findOne({
    userId: user._id,
    centerId,
    status: { $in: ['WAITING', 'CALLED', 'SERVING'] },
  })
    .populate('serviceId', 'name tokenPrefix')
    .lean();

  return sendSuccess(res, {
    message: `[DEV] RFID simulated for ${user.email}`,
    data: {
      user: { _id: user._id, name: user.name, email: user.email },
      activeToken: activeToken || null,
    },
  });
});

/**
 * POST /api/dev/simulate/reset-crowd
 * Reset the crowd count to 0 for a center.
 */
const resetCrowd = asyncHandler(async (req, res) => {
  const { centerId } = req.body;
  if (!centerId) return sendBadRequest(res, 'centerId is required');

  const center = await ServiceCenter.findByIdAndUpdate(
    centerId,
    { $set: { currentCrowd: 0 } },
    { new: true }
  ).lean({ virtuals: true });

  if (!center) return sendNotFound(res, 'Service center not found');

  emitToCenter(centerId.toString(), 'crowd.updated', {
    centerId,
    currentCrowd: 0,
    crowdPercent: 0,
    crowdStatus: 'LOW',
    capacity: center.capacity,
    event: { type: 'RESET', sensorId: 'DEV_SIM', timestamp: new Date(), simulated: true },
  });

  return sendSuccess(res, {
    message: '[DEV] Crowd reset to 0',
    data: { currentCrowd: 0 },
  });
});

module.exports = { simulateCrowd, simulateRfid, resetCrowd };
