'use strict';

const Notification = require('../models/Notification');
const { Token } = require('../models/Token');
const notificationService = require('../services/notificationService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendBadRequest } = require('../utils/apiResponse');

/**
 * GET /api/notifications
 * Get notifications for the authenticated user.
 */
const list = asyncHandler(async (req, res) => {
  const { unreadOnly, limit = 20, page = 1 } = req.query;

  const filter = { userId: req.user._id };
  if (unreadOnly === 'true') filter.isRead = false;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: req.user._id, isRead: false }),
  ]);

  return sendSuccess(res, {
    data: { notifications, unreadCount },
    meta: { total, page: parseInt(page), limit: parseInt(limit) },
  });
});

/**
 * PATCH /api/notifications/:id/read
 */
const markRead = asyncHandler(async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { isRead: true, readAt: new Date() }
  );
  return sendSuccess(res, { message: 'Notification marked as read' });
});

/**
 * PATCH /api/notifications/read-all
 */
const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );
  return sendSuccess(res, {
    message: 'All notifications marked as read',
    data: { updated: result.modifiedCount },
  });
});

/**
 * POST /api/notifications/broadcast
 * Admin sends a broadcast to all users with active tokens at a center.
 */
const broadcast = asyncHandler(async (req, res) => {
  const { centerId, title, body } = req.body;

  if (!centerId || !title || !body) {
    return sendBadRequest(res, 'centerId, title, and body are required');
  }

  // Get all users with active tokens at this center
  const activeTokens = await Token.find({
    centerId,
    status: { $in: ['WAITING', 'CALLED', 'SERVING'] },
  }).select('userId');

  const userIds = [...new Set(activeTokens.map((t) => t.userId.toString()))];

  const notifications = await notificationService.sendBroadcastNotification(
    userIds,
    centerId,
    title,
    body
  );

  return sendSuccess(res, {
    message: `Broadcast sent to ${userIds.length} user(s)`,
    data: { sent: userIds.length, notifications: notifications.length },
  });
});

module.exports = { list, markRead, markAllRead, broadcast };
