'use strict';

const mongoose = require('mongoose');

/**
 * Queue represents the active state of a service queue at a center.
 * One Queue document per center+service+date combination.
 * The `lastIssuedNumber` is atomically incremented for each new token.
 */
const queueSchema = new mongoose.Schema(
  {
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCenter',
      required: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    // Date string YYYY-MM-DD — one queue per service per day
    date: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['OPEN', 'PAUSED', 'CLOSED'],
      default: 'OPEN',
    },
    // The last token number issued (atomically incremented on each join)
    lastIssuedNumber: {
      type: Number,
      default: 0,
    },
    // Total tokens created today
    totalIssued: {
      type: Number,
      default: 0,
    },
    // Count of currently waiting tokens (WAITING status)
    waitingCount: {
      type: Number,
      default: 0,
    },
    // Count of tokens in CALLED or SERVING state
    activeCount: {
      type: Number,
      default: 0,
    },
    // Count of completed tokens today
    completedCount: {
      type: Number,
      default: 0,
    },
    // Count of skipped/cancelled/expired tokens
    abandonedCount: {
      type: Number,
      default: 0,
    },
    // Running average service time in seconds — updated on each completion
    avgServiceTimeSeconds: {
      type: Number,
      default: null, // null = use service.avgServiceTimeMinutes until we have real data
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────
queueSchema.virtual('avgServiceTimeMinutes').get(function () {
  if (!this.avgServiceTimeSeconds) return null;
  return Math.round(this.avgServiceTimeSeconds / 60);
});

// ─── Indexes ──────────────────────────────────────
// Uniqueness: one queue per center+service+date
queueSchema.index({ centerId: 1, serviceId: 1, date: 1 }, { unique: true });
queueSchema.index({ centerId: 1, date: 1 });

const Queue = mongoose.model('Queue', queueSchema);

module.exports = Queue;
