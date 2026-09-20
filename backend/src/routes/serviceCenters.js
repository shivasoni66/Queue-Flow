'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  list, getById, create, update, setCrowd, createValidation,
} = require('../controllers/serviceCenterController');

// Public
router.get('/', list);
router.get('/:id', getById);

// Admin only
router.post('/', protect, requireRole('ADMIN'), createValidation, validate, create);
router.patch('/:id', protect, requireRole('ADMIN'), update);
router.patch('/:id/crowd', protect, requireRole('ADMIN', 'STAFF'), setCrowd);

module.exports = router;
