'use strict';

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { protect, iotSecret, requireRole } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const {
  create,
  getMyTokens,
  getActiveToken,
  getById,
  getQR,
  verifyQR,
  cancel,
  submitFeedback,
  joinValidation,
  feedbackValidation,
  verifyQRValidation,
} = require('../controllers/tokenController');

// Rate limiters for abuse-sensitive customer token operations
const tokenCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many token requests, please try again later.' },
});

const feedbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many feedback submissions, please try again later.' },
});

// Rate limiter for QR verification — tight limit since it is a scanner/staff operation
const verifyQRLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max: process.env.NODE_ENV === 'test' ? 10000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many QR verification requests.' },
});

// All standard token routes require customer/staff/admin authentication
router.use(protect);

router.post('/', tokenCreateLimiter, joinValidation, validate, create);
router.get('/my', getMyTokens);
router.get('/active', getActiveToken);
router.get('/:id', validateObjectId('id'), getById);
router.get('/:id/qr', validateObjectId('id'), getQR);
router.post('/:id/cancel', validateObjectId('id'), cancel);
router.post('/:id/feedback', validateObjectId('id'), feedbackLimiter, feedbackValidation, validate, submitFeedback);

// ─── QR Verification — STAFF/ADMIN only ───────────────────────────────────────
// Requires a valid JWT with STAFF or ADMIN role.
// IoT scanners authenticating via X-IoT-Secret header use the separate /api/iot/scan-qr route.
router.post(
  '/verify-qr',
  verifyQRLimiter,
  requireRole('STAFF', 'ADMIN'),
  verifyQRValidation,
  validate,
  verifyQR
);

module.exports = router;
