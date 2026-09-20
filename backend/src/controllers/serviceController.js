'use strict';

const { body } = require('express-validator');
const Service = require('../models/Service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated, sendNotFound } = require('../utils/apiResponse');

const createValidation = [
  body('centerId').isMongoId().withMessage('Valid centerId is required'),
  body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Service name is required'),
  body('tokenPrefix').trim().notEmpty().isLength({ max: 3 }).withMessage('Token prefix is required'),
  body('avgServiceTimeMinutes').optional().isInt({ min: 1, max: 120 }).withMessage('Must be 1–120 minutes'),
];

/**
 * GET /api/services?centerId=...
 * List active services for a center. Public.
 */
const listByCenter = asyncHandler(async (req, res) => {
  const { centerId } = req.query;

  const filter = { isActive: true };
  if (centerId) filter.centerId = centerId;

  const services = await Service.find(filter).sort({ order: 1, name: 1 }).lean();

  return sendSuccess(res, {
    data: { services },
    meta: { total: services.length },
  });
});

/**
 * GET /api/services/:id
 */
const getById = asyncHandler(async (req, res) => {
  const service = await Service.findById(req.params.id).lean();
  if (!service) return sendNotFound(res, 'Service not found');
  return sendSuccess(res, { data: { service } });
});

/**
 * POST /api/services
 * Admin only.
 */
const create = asyncHandler(async (req, res) => {
  const { centerId, name, tokenPrefix, description, avgServiceTimeMinutes, order } = req.body;

  const service = await Service.create({
    centerId,
    name,
    tokenPrefix: tokenPrefix.toUpperCase(),
    description,
    avgServiceTimeMinutes,
    order,
  });

  return sendCreated(res, { message: 'Service created', data: { service } });
});

/**
 * PATCH /api/services/:id
 * Admin only.
 */
const update = asyncHandler(async (req, res) => {
  const allowed = ['name', 'description', 'avgServiceTimeMinutes', 'isActive', 'order'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  const service = await Service.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });

  if (!service) return sendNotFound(res, 'Service not found');
  return sendSuccess(res, { message: 'Service updated', data: { service } });
});

module.exports = { listByCenter, getById, create, update, createValidation };
