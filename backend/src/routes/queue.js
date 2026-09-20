'use strict';

const router = require('express').Router();
const { getQueueStatus, getServiceQueue, getRecentEvents } = require('../controllers/queueController');
const { protect, requireRole } = require('../middleware/auth');

// Public: customers can see queue status before joining
router.get('/:centerId', getQueueStatus);
router.get('/:centerId/:serviceId', getServiceQueue);

// Admin/Staff only: recent audit log
router.get('/:centerId/events/recent', protect, requireRole('ADMIN', 'STAFF'), getRecentEvents);

module.exports = router;
