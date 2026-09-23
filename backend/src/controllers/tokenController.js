'use strict';

const { body } = require('express-validator');
const { Token } = require('../models/Token');
const queueService = require('../services/queueService');
const { generateQRCodeImage } = require('../utils/tokenUtils');
const asyncHandler = require('../utils/asyncHandler');
const {
  sendSuccess,
  sendCreated,
  sendNotFound,
  sendBadRequest,
  sendConflict,
} = require('../utils/apiResponse');

// ─── Validation ───────────────────────────────────
const joinValidation = [
  body('centerId').isMongoId().withMessage('Valid centerId is required'),
  body('serviceId').isMongoId().withMessage('Valid serviceId is required'),
  body('notifyApp').optional().isBoolean(),
  body('notifySms').optional().isBoolean(),
];

const feedbackValidation = [
  body('rating')
    .custom((val) => typeof val === 'number' && Number.isInteger(val) && val >= 1 && val <= 5)
    .withMessage('Rating must be an integer between 1 and 5'),
  body('comment')
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment must not exceed 500 characters'),
];

// ─── Controllers ──────────────────────────────────

/**
 * POST /api/tokens
 * Customer joins a queue — generates a token.
 * Protected: CUSTOMER role
 */
const create = asyncHandler(async (req, res) => {
  const { centerId, serviceId, notifyApp = true, notifySms = false } = req.body;

  try {
    const { token, queue } = await queueService.joinQueue({
      userId: req.user._id.toString(),
      centerId,
      serviceId,
      notifyApp,
      notifySms,
    });

    return sendCreated(res, {
      message: 'Token generated successfully',
      data: {
        token,
        queue: {
          waitingCount: queue.waitingCount,
          totalIssued: queue.totalIssued,
          avgServiceTimeSeconds: queue.avgServiceTimeSeconds,
        },
      },
    });
  } catch (err) {
    if (err.status === 409 || err.code === 11000) {
      return sendConflict(res, err.message || 'You already have an active token for this service at this center');
    }
    if (err.status === 404) {
      return sendNotFound(res, err.message);
    }
    if (err.status >= 400 && err.status < 500) {
      return sendBadRequest(res, err.message);
    }
    throw err;
  }
});

/**
 * GET /api/tokens/my
 * Get the authenticated user's active token(s).
 */
const getMyTokens = asyncHandler(async (req, res) => {
  let pageNum = parseInt(req.query.page, 10);
  if (isNaN(pageNum) || pageNum < 1) pageNum = 1;

  let limitNum = parseInt(req.query.limit, 10);
  if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
  if (limitNum > 100) limitNum = 100;

  const filter = { userId: req.user._id };
  if (req.query.status && typeof req.query.status === 'string') {
    const s = req.query.status.trim().toUpperCase();
    if (['WAITING', 'CALLED', 'SERVING', 'COMPLETED', 'SKIPPED', 'CANCELLED', 'EXPIRED'].includes(s)) {
      filter.status = s;
    }
  }

  const skip = (pageNum - 1) * limitNum;
  const total = await Token.countDocuments(filter);

  const tokens = await Token.find(filter)
    .populate('serviceId', 'name tokenPrefix avgServiceTimeMinutes')
    .populate('centerId', 'name type address')
    .populate('counterId', 'name number')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)
    .lean({ virtuals: true });

  return sendSuccess(res, {
    data: { tokens },
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    },
  });
});

/**
 * GET /api/tokens/active
 * Get the user's currently active token (WAITING/CALLED/SERVING).
 */
const getActiveToken = asyncHandler(async (req, res) => {
  const token = await Token.findOne({
    userId: req.user._id,
    status: { $in: ['WAITING', 'CALLED', 'SERVING'] },
  })
    .populate('serviceId', 'name tokenPrefix avgServiceTimeMinutes')
    .populate('centerId', 'name type address currentCrowd capacity')
    .populate('counterId', 'name number displayLabel')
    .lean({ virtuals: true });

  return sendSuccess(res, { data: { token: token || null } });
});

/**
 * GET /api/tokens/:id
 * Get a specific token (must belong to the authenticated user or admin/staff).
 */
const getById = asyncHandler(async (req, res) => {
  const token = await Token.findById(req.params.id)
    .populate('serviceId', 'name tokenPrefix avgServiceTimeMinutes')
    .populate('centerId', 'name type address currentCrowd capacity')
    .populate('counterId', 'name number displayLabel')
    .populate('userId', 'name email')
    .lean({ virtuals: true });

  if (!token) return sendNotFound(res, 'Token not found');

  // Customers can only see their own tokens
  if (
    req.user.role === 'CUSTOMER' &&
    token.userId._id.toString() !== req.user._id.toString()
  ) {
    return sendNotFound(res, 'Token not found');
  }

  return sendSuccess(res, { data: { token } });
});

/**
 * GET /api/tokens/:id/qr
 * Return the QR code image for a token.
 */
const getQR = asyncHandler(async (req, res) => {
  const token = await Token.findById(req.params.id).select('qrData userId status');
  if (!token) return sendNotFound(res, 'Token not found');

  if (
    req.user.role === 'CUSTOMER' &&
    token.userId.toString() !== req.user._id.toString()
  ) {
    return sendNotFound(res, 'Token not found');
  }

  const qrImage = await generateQRCodeImage(token.qrData);

  return sendSuccess(res, {
    data: { qrImage, qrData: token.qrData },
  });
});

/**
 * POST /api/tokens/:id/cancel
 * Customer cancels their own waiting token.
 */
const cancel = asyncHandler(async (req, res) => {
  try {
    const token = await queueService.cancelToken({
      tokenId: req.params.id,
      userId: req.user._id.toString(),
    });
    return sendSuccess(res, { message: 'Token cancelled', data: { token } });
  } catch (err) {
    if (err.status === 403) {
      return sendNotFound(res, 'Token not found');
    }
    if (err.status === 400) {
      return sendBadRequest(res, err.message);
    }
    throw err;
  }
});

/**
 * POST /api/tokens/:id/feedback
 * Customer submits feedback after service completion.
 */
const submitFeedback = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return sendBadRequest(res, 'Rating must be between 1 and 5');
  }

  const token = await Token.findOneAndUpdate(
    {
      _id: req.params.id,
      userId: req.user._id,
      status: 'COMPLETED',
      'feedback.rating': null,
    },
    {
      $set: {
        'feedback.rating': rating,
        'feedback.comment': comment || null,
        'feedback.submittedAt': new Date(),
      },
    },
    { new: true }
  );

  if (!token) {
    return sendNotFound(res, 'Token not found or feedback already submitted');
  }

  return sendSuccess(res, { message: 'Feedback submitted', data: { feedback: token.feedback } });
});

module.exports = {
  create,
  getMyTokens,
  getActiveToken,
  getById,
  getQR,
  cancel,
  submitFeedback,
  joinValidation,
  feedbackValidation,
};
