'use strict';

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCenter',
      default: null,
    },
    tokenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Token',
      default: null,
    },
    type: {
      type: String,
      enum: [
        'TOKEN_CREATED',
        'TOKEN_APPROACHING',   // N people ahead
        'TOKEN_CALLED',        // Your turn now
        'TOKEN_SERVING',
        'TOKEN_COMPLETED',
        'TOKEN_SKIPPED',
        'TOKEN_CANCELLED',
        'TOKEN_EXPIRED',
        'QUEUE_DELAYED',
        'QUEUE_CANCELLED',
        'COUNTER_ASSIGNED',
        'BROADCAST',           // Admin broadcast to all queued users
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    body: {
      type: String,
      required: true,
      maxlength: 500,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // Delivery channels
    deliveredViaSocket: {
      type: Boolean,
      default: false,
    },
    deliveredViaFcm: {
      type: Boolean,
      default: false,
    },
    deliveredViaSms: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ tokenId: 1 });

// Auto-delete notifications older than 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
