'use strict';

const { body } = require('express-validator');
const Counter = require('../models/Counter');
const Service = require('../models/Service');
const QueueEvent = require('../models/QueueEvent');
const queueService = require('../services/queueService');
const asyncHandler = require('../utils/asyncHandler');
const {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendBadRequest,
} = require('../utils/apiResponse');
const { emitToCenter, emitToCounter } = require('../config/socket');

// ─── Validation ───────────────────────────────────
const createValidation = [
  body('centerId').isMongoId().withMessage('Valid centerId is required'),
  body('name').trim().notEmpty().withMessage('Counter name is required'),
  body('number').isInt({ min: 1 }).withMessage('Counter number must be a positive integer'),
];

// ─── Controllers ──────────────────────────────────

/**
 * GET /api/counters?centerId=...
 * List all counters for a center. Public.
 */
const list = asyncHandler(async (req, res) => {
  const { centerId } = req.query;
  const filter = {};
  if (centerId) filter.centerId = centerId;

  const counters = await Counter.find(filter)
    .populate('serviceId', 'name tokenPrefix')
    .populate('currentTokenId', 'tokenCode status')
    .populate('staffId', 'name')
    .sort({ number: 1 })
    .lean({ virtuals: true });

  return sendSuccess(res, { data: { counters }, meta: { total: counters.length } });
});

/**
 * GET /api/counters/:id
 */
const getById = asyncHandler(async (req, res) => {
  const counter = await Counter.findById(req.params.id)
    .populate('serviceId', 'name tokenPrefix')
    .populate('currentTokenId', 'tokenCode status calledAt')
    .populate('staffId', 'name')
    .lean({ virtuals: true });

  if (!counter) return sendNotFound(res, 'Counter not found');
  return sendSuccess(res, { data: { counter } });
});

/**
 * POST /api/counters
 * Create a counter. Admin only.
 */
const create = asyncHandler(async (req, res) => {
  const { centerId, name, number, serviceId, displayLabel } = req.body;

  const counter = await Counter.create({
    centerId,
    name,
    number,
    serviceId: serviceId || null,
    displayLabel: displayLabel || name,
  });

  return sendCreated(res, { message: 'Counter created', data: { counter } });
});

/**
 * PATCH /api/counters/:id/status
 * Open, close, or put a counter on break. Admin/Staff.
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['ACTIVE', 'BREAK', 'CLOSED'].includes(status)) {
    return sendBadRequest(res, 'Invalid status. Must be ACTIVE, BREAK, or CLOSED');
  }

  const counter = await Counter.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  )
    .populate('serviceId', 'name')
    .populate('currentTokenId', 'tokenCode status')
    .lean({ virtuals: true });

  if (!counter) return sendNotFound(res, 'Counter not found');

  const eventType =
    status === 'ACTIVE' ? 'COUNTER_OPENED' :
    status === 'BREAK' ? 'COUNTER_BREAK' :
    'COUNTER_CLOSED';

  await QueueEvent.create({
    centerId: counter.centerId,
    counterId: counter._id,
    eventType,
    performedBy: req.user._id,
    metadata: { counterName: counter.name, status },
  });

  emitToCenter(counter.centerId.toString(), 'counter.updated', { counter });

  return sendSuccess(res, { message: `Counter status updated to ${status}`, data: { counter } });
});

/**
 * PATCH /api/counters/:id/assign
 * Assign a service to a counter. Admin/Staff.
 */
const assignService = asyncHandler(async (req, res) => {
  const { serviceId } = req.body;

  if (serviceId) {
    const service = await Service.findById(serviceId);
    if (!service) return sendNotFound(res, 'Service not found');
  }

  const counter = await Counter.findByIdAndUpdate(
    req.params.id,
    { serviceId: serviceId || null },
    { new: true }
  )
    .populate('serviceId', 'name tokenPrefix')
    .populate('currentTokenId', 'tokenCode status')
    .lean({ virtuals: true });

  if (!counter) return sendNotFound(res, 'Counter not found');

  await QueueEvent.create({
    centerId: counter.centerId,
    counterId: counter._id,
    eventType: 'COUNTER_ASSIGNED',
    performedBy: req.user._id,
    metadata: { serviceId, counterName: counter.name },
  });

  emitToCenter(counter.centerId.toString(), 'counter.updated', { counter });

  return sendSuccess(res, { message: 'Service assigned to counter', data: { counter } });
});

/**
 * POST /api/counters/:id/call-next
 * Call the next waiting token for this counter. Staff/Admin.
 */
const callNext = asyncHandler(async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!counter) return sendNotFound(res, 'Counter not found');

  const result = await queueService.callNext({
    counterId: req.params.id,
    centerId: counter.centerId.toString(),
    adminId: req.user._id.toString(),
  });

  if (!result) {
    return sendSuccess(res, { message: 'No waiting tokens in the queue', data: { token: null } });
  }

  return sendSuccess(res, {
    message: `Token ${result.token.tokenCode} called`,
    data: { token: result.token, counter: result.counter },
  });
});

/**
 * POST /api/counters/:id/start-serving
 * Mark current token as SERVING. Staff/Admin.
 */
const startServing = asyncHandler(async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!counter) return sendNotFound(res, 'Counter not found');

  if (!counter.currentTokenId) {
    return sendBadRequest(res, 'No token is currently called at this counter');
  }

  const token = await queueService.startServing({
    tokenId: counter.currentTokenId.toString(),
    counterId: req.params.id,
    adminId: req.user._id.toString(),
  });

  return sendSuccess(res, {
    message: `Token ${token.tokenCode} is now serving`,
    data: { token },
  });
});

/**
 * POST /api/counters/:id/complete
 * Mark the current token as completed. Staff/Admin.
 */
const complete = asyncHandler(async (req, res) => {
  const counter = await Counter.findById(req.params.id);
  if (!counter) return sendNotFound(res, 'Counter not found');

  if (!counter.currentTokenId) {
    return sendBadRequest(res, 'No token is currently being served at this counter');
  }

  const result = await queueService.completeToken({
    tokenId: counter.currentTokenId.toString(),
    counterId: req.params.id,
    adminId: req.user._id.toString(),
  });

  return sendSuccess(res, {
    message: `Token ${result.token.tokenCode} completed`,
    data: { token: result.token, counter: result.counter },
  });
});

/**
 * POST /api/counters/:id/skip
 * Skip the current or a specific token. Staff/Admin.
 */
const skip = asyncHandler(async (req, res) => {
  const { tokenId } = req.body;
  const counter = await Counter.findById(req.params.id);
  if (!counter) return sendNotFound(res, 'Counter not found');

  const targetTokenId = tokenId || counter.currentTokenId?.toString();
  if (!targetTokenId) {
    return sendBadRequest(res, 'No token to skip');
  }

  const token = await queueService.skipToken({
    tokenId: targetTokenId,
    counterId: req.params.id,
    adminId: req.user._id.toString(),
  });

  return sendSuccess(res, {
    message: `Token ${token.tokenCode} skipped`,
    data: { token },
  });
});

module.exports = {
  list,
  getById,
  create,
  updateStatus,
  assignService,
  callNext,
  startServing,
  complete,
  skip,
  createValidation,
};
