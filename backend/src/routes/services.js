'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const { listByCenter, getById, create, update, createValidation } = require('../controllers/serviceController');

router.get('/', listByCenter);
router.get('/:id', validateObjectId('id'), getById);
router.post('/', protect, requireRole('ADMIN'), createValidation, validate, create);
router.patch('/:id', protect, requireRole('ADMIN'), validateObjectId('id'), update);

module.exports = router;
