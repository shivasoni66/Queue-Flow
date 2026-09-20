'use strict';

/**
 * DEV SIMULATOR ROUTES
 * Only mounted when NODE_ENV=development && DEV_SIMULATOR_ENABLED=true
 * Guard is applied in server.js before mounting this router.
 */

const router = require('express').Router();
const { simulateCrowd, simulateRfid, resetCrowd } = require('../controllers/devController');

const devOnly = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' || process.env.DEV_SIMULATOR_ENABLED !== 'true') {
    return res.status(403).json({ success: false, message: 'Simulator endpoints are disabled in this environment' });
  }
  next();
};

router.use(devOnly);

router.post('/simulate/crowd', simulateCrowd);
router.post('/simulate/rfid', simulateRfid);
router.post('/simulate/reset-crowd', resetCrowd);

module.exports = router;
