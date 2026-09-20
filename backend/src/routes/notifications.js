'use strict';

const router = require('express').Router();
const { protect, requireRole } = require('../middleware/auth');
const { list, markRead, markAllRead, broadcast } = require('../controllers/notificationController');

router.use(protect);

router.get('/', list);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markRead);
router.post('/broadcast', requireRole('ADMIN', 'STAFF'), broadcast);

module.exports = router;
