'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  create, getMyTokens, getActiveToken, getById, getQR, cancel, submitFeedback, joinValidation,
} = require('../controllers/tokenController');

// All token routes require authentication
router.use(protect);

router.post('/', joinValidation, validate, create);
router.get('/my', getMyTokens);
router.get('/active', getActiveToken);
router.get('/:id', getById);
router.get('/:id/qr', getQR);
router.post('/:id/cancel', cancel);
router.post('/:id/feedback', submitFeedback);

module.exports = router;
