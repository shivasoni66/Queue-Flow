'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const { validateObjectId } = require('../middleware/validate');
const { getDashboard, getTokenTimeSeries } = require('../controllers/analyticsController');

// Analytics require admin or staff access
router.use(protect, requireRole('ADMIN', 'STAFF'));

router.get('/:centerId', validateObjectId('centerId'), getDashboard);
router.get('/:centerId/tokens', validateObjectId('centerId'), getTokenTimeSeries);

module.exports = router;
