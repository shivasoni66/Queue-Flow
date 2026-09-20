'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const { getDashboard, getTokenTimeSeries } = require('../controllers/analyticsController');

// Analytics require admin or staff access
router.use(protect, requireRole('ADMIN', 'STAFF'));

router.get('/:centerId', getDashboard);
router.get('/:centerId/tokens', getTokenTimeSeries);

module.exports = router;
