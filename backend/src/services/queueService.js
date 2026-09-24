'use strict';

const mongoose = require('mongoose');
const Queue = require('../models/Queue');
const { Token, TOKEN_STATUSES } = require('../models/Token');
const Counter = require('../models/Counter');
const ServiceCenter = require('../models/ServiceCenter');
const Service = require('../models/Service');
const QueueEvent = require('../models/QueueEvent');
const { getTodayDateString, formatTokenCode, generateQRData } = require('../utils/tokenUtils');
const waitTimeService = require('./waitTimeService');
const notificationService = require('./notificationService');
const { emitToCenter, emitToUser, emitToCounter } = require('../config/socket');

/**
 * Sanitize a token payload before emitting to public center / counter rooms.
 * Removes customer-identifying fields (userId) to ensure public queue displays
 * and center listeners never receive customer ownership or PII.
 *
 * @param {object} token - Populated or plain token object
 * @returns {object} Sanitized token object safe for public center broadcasts
 */
function _sanitizeTokenForCenter(token) {
  if (!token || typeof token !== 'object') return token;
  const { userId, ...safeToken } = token;
  return safeToken;
}

/**
 * Get or create today's Queue document for a center+service pair.
 * Creates with default values if it does not exist.
 *
 * @param {string} centerId
 * @param {string} serviceId
 * @returns {Promise<Queue>}
 */
async function getOrCreateQueue(centerId, serviceId) {
  const date = getTodayDateString();
  let queue = await Queue.findOne({ centerId, serviceId, date });

  if (!queue) {
    queue = await Queue.create({
      centerId,
      serviceId,
      date,
      status: 'OPEN',
      lastIssuedNumber: 0,
      totalIssued: 0,
      waitingCount: 0,
      activeCount: 0,
      completedCount: 0,
      abandonedCount: 0,
    });
  }

  return queue;
}

/**
 * Join a queue: generate a token atomically.
 *
 * Business rules:
 * - A user may not have more than one active token per center+service (WAITING/CALLED/SERVING).
 * - Service center must exist and be open.
 * - Service must exist, be active, and belong to the requested center.
 * - Queue must be OPEN.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.centerId
 * @param {string} params.serviceId
 * @param {boolean} [params.notifyApp=true]
 * @param {boolean} [params.notifySms=false]
 * @returns {Promise<{ token: Token, queue: Queue }>}
 */
async function joinQueue({ userId, centerId, serviceId, notifyApp = true, notifySms = false }) {
  // 1. Verify service center exists and is open
  const center = await ServiceCenter.findById(centerId);
  if (!center) {
    const err = new Error('Service center not found');
    err.status = 404;
    throw err;
  }

  if (!center.isOpen) {
    const err = new Error('Service center is currently closed');
    err.status = 400;
    throw err;
  }

  // 2. Verify service exists, belongs to center, and is active
  const service = await Service.findById(serviceId);
  if (!service) {
    const err = new Error('Service not found');
    err.status = 404;
    throw err;
  }

  if (service.centerId.toString() !== centerId.toString()) {
    const err = new Error('The requested service does not belong to this service center');
    err.status = 400;
    throw err;
  }

  if (!service.isActive) {
    const err = new Error('Service is not currently available');
    err.status = 400;
    throw err;
  }

  // 3. Check for existing active token
  const existingToken = await Token.findOne({
    userId,
    centerId,
    serviceId,
    status: { $in: ['WAITING', 'CALLED', 'SERVING'] },
  });

  if (existingToken) {
    const err = new Error('You already have an active token for this service at this center');
    err.status = 409;
    err.existingToken = existingToken;
    throw err;
  }

  // 3. Atomically increment queue counters and create token inside a MongoDB transaction
  const date = getTodayDateString();
  let token;
  let queue;
  let waitEstimate;
  let tokenCode;
  let position;

  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (_) {
    session = null;
  }

  if (session) {
    try {
      await session.withTransaction(async () => {
        // Re-check for existing active token within transaction snapshot
        const activeInTx = await Token.findOne({
          userId,
          centerId,
          serviceId,
          status: { $in: ['WAITING', 'CALLED', 'SERVING'] },
        }).session(session);

        if (activeInTx) {
          const err = new Error('You already have an active token for this service at this center');
          err.status = 409;
          err.existingToken = activeInTx;
          throw err;
        }

        queue = await Queue.findOneAndUpdate(
          { centerId, serviceId, date },
          {
            $inc: { lastIssuedNumber: 1, totalIssued: 1, waitingCount: 1 },
            $setOnInsert: {
              centerId,
              serviceId,
              date,
              status: 'OPEN',
              completedCount: 0,
              abandonedCount: 0,
              activeCount: 0,
            },
          },
          { new: true, upsert: true, session }
        );

        if (queue.status !== 'OPEN') {
          const err = new Error('This queue is currently not accepting new tokens');
          err.status = 409;
          throw err;
        }

        const tokenNumber = queue.lastIssuedNumber;
        tokenCode = formatTokenCode(service.tokenPrefix, tokenNumber);

        waitEstimate = await waitTimeService.estimateWait({
          centerId,
          serviceId,
          queue,
          service,
        });

        position = queue.waitingCount;
        // Generate temporary placeholder qrData (tokenId not yet known)
        const tmpQrResult = generateQRData('pending', centerId.toString(), serviceId.toString());

        const [created] = await Token.create(
          [
            {
              tokenCode,
              tokenNumber,
              userId,
              centerId,
              serviceId,
              status: 'WAITING',
              initialPosition: position,
              currentPosition: position,
              waitEstimateMinutes: waitEstimate,
              qrData: tmpQrResult.qrData,
              notifyApp,
              notifySms,
            },
          ],
          { session }
        );

        // Regenerate signed QR with the real tokenId now that the document exists
        const finalQrResult = generateQRData(created._id.toString(), centerId.toString(), serviceId.toString());
        created.qrData = finalQrResult.qrData;
        created.qrNonce = finalQrResult.nonce;
        created.qrIssuedAt = finalQrResult.issuedAt;
        await created.save({ session });
        token = created;
      });
    } catch (err) {
      if (err.code === 11000) {
        const conflictErr = new Error('You already have an active token for this service at this center');
        conflictErr.status = 409;
        throw conflictErr;
      }
      throw err;
    } finally {
      await session.endSession();
    }
  } else {
    // Non-transactional fallback for standalone Mongo instances without replica set
    queue = await Queue.findOneAndUpdate(
      { centerId, serviceId, date },
      {
        $inc: { lastIssuedNumber: 1, totalIssued: 1, waitingCount: 1 },
        $setOnInsert: {
          centerId,
          serviceId,
          date,
          status: 'OPEN',
          completedCount: 0,
          abandonedCount: 0,
          activeCount: 0,
        },
      },
      { new: true, upsert: true }
    );

    if (queue.status !== 'OPEN') {
      await Queue.findByIdAndUpdate(queue._id, {
        $inc: { lastIssuedNumber: -1, totalIssued: -1, waitingCount: -1 },
      });
      const err = new Error('This queue is currently not accepting new tokens');
      err.status = 409;
      throw err;
    }

    const tokenNumber = queue.lastIssuedNumber;
    tokenCode = formatTokenCode(service.tokenPrefix, tokenNumber);

    waitEstimate = await waitTimeService.estimateWait({
      centerId,
      serviceId,
      queue,
      service,
    });

    position = queue.waitingCount;
    // Generate temporary placeholder (tokenId not yet known)
    const tmpQrResult = generateQRData('pending', centerId.toString(), serviceId.toString());

    try {
      token = await Token.create({
        tokenCode,
        tokenNumber,
        userId,
        centerId,
        serviceId,
        status: 'WAITING',
        initialPosition: position,
        currentPosition: position,
        waitEstimateMinutes: waitEstimate,
        qrData: tmpQrResult.qrData,
        notifyApp,
        notifySms,
      });
    } catch (err) {
      if (err.code === 11000) {
        await Queue.findByIdAndUpdate(queue._id, {
          $inc: { lastIssuedNumber: -1, totalIssued: -1, waitingCount: -1 },
        });
        const conflictErr = new Error('You already have an active token for this service at this center');
        conflictErr.status = 409;
        throw conflictErr;
      }
      throw err;
    }

    // Regenerate signed QR with the real tokenId
    const finalQrResult = generateQRData(token._id.toString(), centerId.toString(), serviceId.toString());
    token.qrData = finalQrResult.qrData;
    token.qrNonce = finalQrResult.nonce;
    token.qrIssuedAt = finalQrResult.issuedAt;
    await token.save();
  }

  // 8. Log the event
  await QueueEvent.create({
    centerId,
    tokenId: token._id,
    eventType: 'TOKEN_CREATED',
    performedBy: userId,
    metadata: { tokenCode, serviceId, position, waitEstimate },
  });

  // 9. Emit Socket.IO events
  const populatedToken = await Token.findById(token._id)
    .populate('serviceId', 'name tokenPrefix')
    .populate('centerId', 'name')
    .populate('counterId', 'name number')
    .lean();

  emitToCenter(centerId.toString(), 'queue.updated', {
    centerId,
    serviceId,
    waitingCount: queue.waitingCount,
    totalIssued: queue.totalIssued,
  });

  emitToUser(userId.toString(), 'token.created', { token: populatedToken });

  // 10. Send creation notification
  await notificationService.sendTokenNotification(token, 'TOKEN_CREATED', {
    title: 'Token Generated',
    body: `Your token ${tokenCode} is confirmed. Position: ${position}. Est. wait: ${waitEstimate} min.`,
  });

  return { token: populatedToken, queue };
}

/**
 * Call the next waiting token for a counter.
 *
 * @param {object} params
 * @param {string} params.counterId
 * @param {string} params.centerId
 * @param {string} params.adminId - User performing the action
 * @returns {Promise<{ token: Token, counter: Counter } | null>}
 */
async function callNext({ counterId, centerId, adminId }) {
  const counter = await Counter.findById(counterId).populate('serviceId');

  if (!counter) {
    const err = new Error('Counter not found');
    err.status = 404;
    throw err;
  }

  if (counter.status !== 'ACTIVE') {
    const err = new Error('Counter is not active');
    err.status = 400;
    throw err;
  }

  if (!counter.serviceId) {
    const err = new Error('No service assigned to this counter');
    err.status = 400;
    throw err;
  }

  // Find the next WAITING token (oldest first)
  const nextToken = await Token.findOne({
    centerId,
    serviceId: counter.serviceId._id,
    status: 'WAITING',
  })
    .sort({ createdAt: 1 })
    .populate('userId', 'name email preferences');

  if (!nextToken) {
    return null; // Queue is empty — no token to call
  }

  // If the counter was serving someone, that token should already be COMPLETED
  // (enforced via completeToken), but defensively handle it
  if (counter.currentTokenId) {
    await Token.findByIdAndUpdate(counter.currentTokenId, { status: 'COMPLETED', completedAt: new Date() });
  }

  // Update token status
  nextToken.status = 'CALLED';
  nextToken.calledAt = new Date();
  nextToken.counterId = counter._id;
  await nextToken.save();

  // Update counter
  counter.currentTokenId = nextToken._id;
  counter.servingStartedAt = new Date();
  await counter.save();

  // Update queue counts
  await Queue.findOneAndUpdate(
    { centerId, serviceId: counter.serviceId._id, date: getTodayDateString() },
    { $inc: { waitingCount: -1, activeCount: 1 } }
  );

  // Log event
  await QueueEvent.create({
    centerId,
    tokenId: nextToken._id,
    counterId: counter._id,
    eventType: 'TOKEN_CALLED',
    performedBy: adminId,
    metadata: { tokenCode: nextToken.tokenCode, counterName: counter.name },
  });

  // Update positions for all remaining waiting tokens
  await _updateWaitingPositions(centerId, counter.serviceId._id);

  // Populate and emit
  const populatedToken = await Token.findById(nextToken._id)
    .populate('serviceId', 'name tokenPrefix')
    .populate('centerId', 'name')
    .populate('counterId', 'name number displayLabel')
    .populate('userId', 'name')
    .lean();

  const populatedCounter = await Counter.findById(counter._id)
    .populate('serviceId', 'name')
    .populate('currentTokenId', 'tokenCode status')
    .lean();

  const publicToken = _sanitizeTokenForCenter(populatedToken);

  // Emit to center room (sanitized for public display boards)
  emitToCenter(centerId.toString(), 'token.called', {
    token: publicToken,
    counter: populatedCounter,
  });

  // Emit to verified customer's private room
  emitToUser(nextToken.userId.toString(), 'token.called', {
    token: populatedToken,
    counter: populatedCounter,
  });

  // Emit to counter display kiosk
  emitToCounter(centerId.toString(), counterId.toString(), 'counter.updated', {
    counter: populatedCounter,
    token: publicToken,
  });

  // Notify the customer
  await notificationService.sendTokenNotification(nextToken, 'TOKEN_CALLED', {
    title: 'Your Turn!',
    body: `Token ${nextToken.tokenCode} — Please proceed to ${counter.name}`,
  });

  return { token: populatedToken, counter: populatedCounter };
}

/**
 * Mark a token as SERVING (customer has arrived at counter).
 * Typically triggered by staff at the counter.
 */
async function startServing({ tokenId, counterId, adminId }) {
  const token = await Token.findById(tokenId);
  if (!token) {
    const err = new Error('Token not found');
    err.status = 404;
    throw err;
  }

  if (token.status !== 'CALLED') {
    const err = new Error(`Cannot start serving: token status is ${token.status}`);
    err.status = 400;
    throw err;
  }

  token.status = 'SERVING';
  token.servingAt = new Date();
  await token.save();

  const counter = await Counter.findById(counterId);
  if (counter) {
    counter.servingStartedAt = new Date();
    await counter.save();
  }

  await Queue.findOneAndUpdate(
    { centerId: token.centerId, serviceId: token.serviceId, date: getTodayDateString() },
    { $inc: { activeCount: 0 } } // already counted in CALLED→SERVING
  );

  await QueueEvent.create({
    centerId: token.centerId,
    tokenId: token._id,
    counterId,
    eventType: 'TOKEN_SERVING',
    performedBy: adminId,
    metadata: { tokenCode: token.tokenCode },
  });

  const populated = await Token.findById(token._id)
    .populate('serviceId', 'name')
    .populate('counterId', 'name number')
    .lean();

  emitToCenter(token.centerId.toString(), 'token.serving', { token: _sanitizeTokenForCenter(populated) });
  emitToUser(token.userId.toString(), 'token.serving', { token: populated });

  return populated;
}

/**
 * Complete a token (service delivered successfully).
 */
async function completeToken({ tokenId, counterId, adminId }) {
  const token = await Token.findById(tokenId);
  if (!token) {
    const err = new Error('Token not found');
    err.status = 404;
    throw err;
  }

  if (!['CALLED', 'SERVING'].includes(token.status)) {
    const err = new Error(`Cannot complete: token status is ${token.status}`);
    err.status = 400;
    throw err;
  }

  const now = new Date();
  const startTime = token.servingAt || token.calledAt || token.createdAt;
  const actualServiceSeconds = Math.round((now - startTime) / 1000);

  token.status = 'COMPLETED';
  token.completedAt = now;
  token.actualServiceSeconds = actualServiceSeconds;
  await token.save();

  // Update counter stats
  const counter = await Counter.findById(counterId);
  if (counter) {
    const prevAvg = counter.stats.avgServiceSeconds || actualServiceSeconds;
    const prevCount = counter.stats.served || 0;
    const newAvg = Math.round((prevAvg * prevCount + actualServiceSeconds) / (prevCount + 1));

    counter.stats.served += 1;
    counter.stats.avgServiceSeconds = newAvg;
    counter.currentTokenId = null;
    counter.servingStartedAt = null;
    await counter.save();
  }

  // Update queue counts and running avg service time
  const queue = await Queue.findOne({
    centerId: token.centerId,
    serviceId: token.serviceId,
    date: getTodayDateString(),
  });

  if (queue) {
    const prevAvg = queue.avgServiceTimeSeconds || actualServiceSeconds;
    const prevDone = queue.completedCount || 0;
    const newQueueAvg = Math.round((prevAvg * prevDone + actualServiceSeconds) / (prevDone + 1));

    await Queue.findByIdAndUpdate(queue._id, {
      $inc: { activeCount: -1, completedCount: 1 },
      $set: { avgServiceTimeSeconds: newQueueAvg },
    });
  }

  await QueueEvent.create({
    centerId: token.centerId,
    tokenId: token._id,
    counterId,
    eventType: 'TOKEN_COMPLETED',
    performedBy: adminId,
    metadata: { tokenCode: token.tokenCode, actualServiceSeconds },
  });

  const populated = await Token.findById(token._id)
    .populate('serviceId', 'name')
    .populate('centerId', 'name')
    .populate('counterId', 'name number')
    .lean();

  const populatedCounter = counter
    ? await Counter.findById(counter._id).populate('serviceId', 'name').lean()
    : null;

  emitToCenter(token.centerId.toString(), 'token.completed', {
    token: _sanitizeTokenForCenter(populated),
    counter: populatedCounter,
  });
  emitToUser(token.userId.toString(), 'token.completed', { token: populated });
  if (populatedCounter) {
    emitToCounter(token.centerId.toString(), counterId.toString(), 'counter.updated', {
      counter: populatedCounter,
      token: null,
    });
  }

  await notificationService.sendTokenNotification(token, 'TOKEN_COMPLETED', {
    title: 'Service Completed',
    body: `Thank you! Your service for token ${token.tokenCode} has been completed.`,
  });

  return { token: populated, counter: populatedCounter };
}

/**
 * Skip a token (customer no-show or admin action).
 */
async function skipToken({ tokenId, counterId, adminId }) {
  const token = await Token.findById(tokenId);
  if (!token) {
    const err = new Error('Token not found');
    err.status = 404;
    throw err;
  }

  if (!['WAITING', 'CALLED'].includes(token.status)) {
    const err = new Error(`Cannot skip: token status is ${token.status}`);
    err.status = 400;
    throw err;
  }

  const wasWaiting = token.status === 'WAITING';
  token.status = 'SKIPPED';
  await token.save();

  if (counterId) {
    const counter = await Counter.findById(counterId);
    if (counter && counter.currentTokenId?.toString() === tokenId.toString()) {
      counter.currentTokenId = null;
      counter.servingStartedAt = null;
      counter.stats.skipped = (counter.stats.skipped || 0) + 1;
      await counter.save();
    }
  }

  await Queue.findOneAndUpdate(
    { centerId: token.centerId, serviceId: token.serviceId, date: getTodayDateString() },
    {
      $inc: {
        waitingCount: wasWaiting ? -1 : 0,
        activeCount: wasWaiting ? 0 : -1,
        abandonedCount: 1,
      },
    }
  );

  await _updateWaitingPositions(token.centerId, token.serviceId);

  await QueueEvent.create({
    centerId: token.centerId,
    tokenId: token._id,
    counterId: counterId || null,
    eventType: 'TOKEN_SKIPPED',
    performedBy: adminId,
    metadata: { tokenCode: token.tokenCode },
  });

  const populated = await Token.findById(token._id).populate('serviceId', 'name').lean();

  emitToCenter(token.centerId.toString(), 'token.skipped', { token: _sanitizeTokenForCenter(populated) });
  emitToUser(token.userId.toString(), 'token.skipped', { token: populated });

  await notificationService.sendTokenNotification(token, 'TOKEN_SKIPPED', {
    title: 'Token Skipped',
    body: `Token ${token.tokenCode} was skipped. Please visit the counter if you are present.`,
  });

  return populated;
}

/**
 * Customer cancels their own token.
 */
async function cancelToken({ tokenId, userId }) {
  const token = await Token.findById(tokenId);
  if (!token) {
    const err = new Error('Token not found');
    err.status = 404;
    throw err;
  }

  if (token.userId.toString() !== userId.toString()) {
    const err = new Error('You can only cancel your own tokens');
    err.status = 403;
    throw err;
  }

  if (!['WAITING'].includes(token.status)) {
    const err = new Error(`Token cannot be cancelled in status: ${token.status}`);
    err.status = 400;
    throw err;
  }

  token.status = 'CANCELLED';
  await token.save();

  await Queue.findOneAndUpdate(
    { centerId: token.centerId, serviceId: token.serviceId, date: getTodayDateString() },
    { $inc: { waitingCount: -1, abandonedCount: 1 } }
  );

  await _updateWaitingPositions(token.centerId, token.serviceId);

  await QueueEvent.create({
    centerId: token.centerId,
    tokenId: token._id,
    eventType: 'TOKEN_CANCELLED',
    performedBy: userId,
    metadata: { tokenCode: token.tokenCode },
  });

  const populated = await Token.findById(token._id).populate('serviceId', 'name').lean();

  emitToCenter(token.centerId.toString(), 'token.cancelled', { token: _sanitizeTokenForCenter(populated) });
  emitToUser(userId.toString(), 'token.cancelled', { token: populated });

  return populated;
}

/**
 * Expire a token that was called but the customer didn't show up.
 * Called by a scheduled job or the no-show handler.
 */
async function expireToken({ tokenId, counterId }) {
  const token = await Token.findById(tokenId);
  if (!token || token.status !== 'CALLED') return null;

  token.status = 'EXPIRED';
  await token.save();

  if (counterId) {
    await Counter.findByIdAndUpdate(counterId, {
      $set: { currentTokenId: null, servingStartedAt: null },
    });
  }

  await Queue.findOneAndUpdate(
    { centerId: token.centerId, serviceId: token.serviceId, date: getTodayDateString() },
    { $inc: { activeCount: -1, abandonedCount: 1 } }
  );

  await QueueEvent.create({
    centerId: token.centerId,
    tokenId: token._id,
    counterId: counterId || null,
    eventType: 'TOKEN_EXPIRED',
    metadata: { tokenCode: token.tokenCode },
  });

  const populated = await Token.findById(token._id).populate('serviceId', 'name').lean();
  emitToCenter(token.centerId.toString(), 'token.expired', { token: _sanitizeTokenForCenter(populated) });
  emitToUser(token.userId.toString(), 'token.expired', { token: populated });

  await notificationService.sendTokenNotification(token, 'TOKEN_EXPIRED', {
    title: 'Token Expired',
    body: `Your token ${token.tokenCode} has expired as you were not present at the counter.`,
  });

  return populated;
}

/**
 * Get live queue status for a center (all services).
 */
async function getQueueStatus(centerId) {
  const date = getTodayDateString();
  const queues = await Queue.find({ centerId, date })
    .populate('serviceId', 'name tokenPrefix avgServiceTimeMinutes')
    .lean();

  const counters = await Counter.find({ centerId })
    .populate('serviceId', 'name')
    .populate('currentTokenId', 'tokenCode status')
    .lean();

  const result = queues.map((q) => ({
    queueId: q._id,
    service: q.serviceId,
    status: q.status,
    waitingCount: q.waitingCount,
    activeCount: q.activeCount,
    completedCount: q.completedCount,
    abandonedCount: q.abandonedCount,
    totalIssued: q.totalIssued,
    avgServiceTimeSeconds: q.avgServiceTimeSeconds,
    lastIssuedNumber: q.lastIssuedNumber,
    counters: counters.filter(
      (c) => c.serviceId && c.serviceId._id.toString() === q.serviceId._id.toString()
    ),
  }));

  return result;
}

/**
 * Internal: recalculate and update currentPosition for all WAITING tokens
 * in a service queue. Called after any token state change.
 *
 * Positions are assigned 1, 2, 3... based on createdAt order.
 */
async function _updateWaitingPositions(centerId, serviceId) {
  const waitingTokens = await Token.find({
    centerId,
    serviceId,
    status: 'WAITING',
  })
    .sort({ createdAt: 1 })
    .select('_id userId waitEstimateMinutes');

  // Get queue avg service time for re-estimation
  const queue = await Queue.findOne({ centerId, serviceId, date: getTodayDateString() });
  const service = await Service.findById(serviceId).select('avgServiceTimeMinutes');
  const avgMinutes =
    queue?.avgServiceTimeSeconds
      ? Math.ceil(queue.avgServiceTimeSeconds / 60)
      : service?.avgServiceTimeMinutes || 8;

  const bulkOps = waitingTokens.map((token, idx) => {
    const position = idx + 1;
    const newWait = Math.max(1, Math.round(position * avgMinutes));
    return {
      updateOne: {
        filter: { _id: token._id },
        update: { $set: { currentPosition: position, waitEstimateMinutes: newWait } },
      },
    };
  });

  if (bulkOps.length > 0) {
    await Token.bulkWrite(bulkOps);
  }

  // Emit position updates to each affected user
  for (const [idx, token] of waitingTokens.entries()) {
    const position = idx + 1;
    const newWait = Math.max(1, Math.round(position * avgMinutes));
    emitToUser(token.userId.toString(), 'token.position_updated', {
      tokenId: token._id,
      currentPosition: position,
      waitEstimateMinutes: newWait,
    });
  }
}

module.exports = {
  getOrCreateQueue,
  joinQueue,
  callNext,
  startServing,
  completeToken,
  skipToken,
  cancelToken,
  expireToken,
  getQueueStatus,
  _updateWaitingPositions,
};
