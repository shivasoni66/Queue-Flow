'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { listByCenter, getById, create, update, createValidation } = require('../controllers/serviceController');

router.get('/', listByCenter);
router.get('/:id', getById);
router.post('/', protect, requireRole('ADMIN'), createValidation, validate, create);
router.patch('/:id', protect, requireRole('ADMIN'), update);

module.exports = router;
