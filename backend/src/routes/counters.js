'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  list, getById, create, updateStatus, assignService, callNext, startServing, complete, skip, createValidation,
} = require('../controllers/counterController');

// Public: list counters (customer app shows counter count)
router.get('/', list);
router.get('/:id', getById);

// Admin/Staff operations
router.post('/', protect, requireRole('ADMIN'), createValidation, validate, create);
router.patch('/:id/status', protect, requireRole('ADMIN', 'STAFF'), updateStatus);
router.patch('/:id/assign', protect, requireRole('ADMIN', 'STAFF'), assignService);
router.post('/:id/call-next', protect, requireRole('ADMIN', 'STAFF'), callNext);
router.post('/:id/start-serving', protect, requireRole('ADMIN', 'STAFF'), startServing);
router.post('/:id/complete', protect, requireRole('ADMIN', 'STAFF'), complete);
router.post('/:id/skip', protect, requireRole('ADMIN', 'STAFF'), skip);

module.exports = router;
