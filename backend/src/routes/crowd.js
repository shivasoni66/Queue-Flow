'use strict';

const router = require('express').Router();
const { getCrowd, getHistory } = require('../controllers/crowdController');

// Public — customer app shows crowd before joining
router.get('/:centerId', getCrowd);
router.get('/:centerId/history', getHistory);

module.exports = router;
