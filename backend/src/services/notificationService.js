'use strict';

const Notification = require('../models/Notification');
const { emitToUser } = require('../config/socket');

/**
 * Send a notification for a token lifecycle event.
 * Stores it in MongoDB and delivers it via Socket.IO (real-time in-app).
 * FCM is stubbed for later integration.
 *
 * @param {object} token - Token document (must have userId, centerId, tokenCode)
 * @param {string} type  - Notification type (TOKEN_CREATED, TOKEN_CALLED, etc.)
 * @param {object} content
 * @param {string} content.title
 * @param {string} content.body
 */
async function sendTokenNotification(token, type, { title, body }) {
  try {
    const notification = await Notification.create({
      userId: token.userId,
      centerId: token.centerId,
      tokenId: token._id,
      type,
      title,
      body,
      deliveredViaSocket: false,
      deliveredViaFcm: false,
      deliveredViaSms: false,
    });

    // Deliver via Socket.IO to the user's personal room
    emitToUser(token.userId.toString(), 'notification.created', {
      notification: {
        _id: notification._id,
        type,
        title,
        body,
        tokenId: token._id,
        isRead: false,
        createdAt: notification.createdAt,
      },
    });

    // Mark as socket-delivered
    await Notification.findByIdAndUpdate(notification._id, { deliveredViaSocket: true });

    // ── FCM Stub ─────────────────────────────────────────────────────────────
    // When FCM is configured, call sendFcmNotification() here:
    // if (process.env.FCM_SERVER_KEY) {
    //   await sendFcmNotification(token.userId, title, body);
    //   await Notification.findByIdAndUpdate(notification._id, { deliveredViaFcm: true });
    // }

    return notification;
  } catch (err) {
    // Notification failure must never break the core queue operation
    console.error('[Notification] Failed to send notification:', err.message);
    return null;
  }
}

/**
 * Send a broadcast notification to multiple users (e.g. admin to all queued visitors).
 * @param {string[]} userIds
 * @param {string} centerId
 * @param {string} title
 * @param {string} body
 */
async function sendBroadcastNotification(userIds, centerId, title, body) {
  const notifications = [];

  for (const userId of userIds) {
    try {
      const notification = await Notification.create({
        userId,
        centerId,
        type: 'BROADCAST',
        title,
        body,
        deliveredViaSocket: false,
      });

      emitToUser(userId.toString(), 'notification.created', {
        notification: {
          _id: notification._id,
          type: 'BROADCAST',
          title,
          body,
          isRead: false,
          createdAt: notification.createdAt,
        },
      });

      await Notification.findByIdAndUpdate(notification._id, { deliveredViaSocket: true });
      notifications.push(notification);
    } catch (err) {
      console.error(`[Notification] Failed to broadcast to ${userId}:`, err.message);
    }
  }

  return notifications;
}

module.exports = { sendTokenNotification, sendBroadcastNotification };
