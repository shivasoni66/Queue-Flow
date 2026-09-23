'use strict';

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const {
  create,
  getMyTokens,
  getActiveToken,
  getById,
  getQR,
  cancel,
  submitFeedback,
  joinValidation,
  feedbackValidation,
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

// All token routes require authentication
router.use(protect);

router.post('/', tokenCreateLimiter, joinValidation, validate, create);
router.get('/my', getMyTokens);
router.get('/active', getActiveToken);
router.get('/:id', validateObjectId('id'), getById);
router.get('/:id/qr', validateObjectId('id'), getQR);
router.post('/:id/cancel', validateObjectId('id'), cancel);
router.post('/:id/feedback', validateObjectId('id'), feedbackLimiter, feedbackValidation, validate, submitFeedback);

module.exports = router;
