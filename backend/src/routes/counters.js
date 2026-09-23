'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const {
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
} = require('../controllers/counterController');

// Public: list counters (customer app shows counter count)
router.get('/', list);
router.get('/:id', validateObjectId('id'), getById);

// Admin/Staff operations
router.post('/', protect, requireRole('ADMIN'), createValidation, validate, create);
router.patch('/:id/status', protect, requireRole('ADMIN', 'STAFF'), validateObjectId('id'), updateStatus);
router.patch('/:id/assign', protect, requireRole('ADMIN', 'STAFF'), validateObjectId('id'), assignService);
router.post('/:id/call-next', protect, requireRole('ADMIN', 'STAFF'), validateObjectId('id'), callNext);
router.post('/:id/start-serving', protect, requireRole('ADMIN', 'STAFF'), validateObjectId('id'), startServing);
router.post('/:id/complete', protect, requireRole('ADMIN', 'STAFF'), validateObjectId('id'), complete);
router.post('/:id/skip', protect, requireRole('ADMIN', 'STAFF'), validateObjectId('id'), skip);

module.exports = router;
