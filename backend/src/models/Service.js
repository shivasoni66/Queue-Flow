'use strict';

const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCenter',
      required: [true, 'Service center reference is required'],
    },
    name: {
      type: String,
      required: [true, 'Service name is required'],
      trim: true,
      maxlength: [100, 'Name must not exceed 100 characters'],
    },
    // Single uppercase letter used as token prefix (e.g. 'A' → A-001, A-002...)
    tokenPrefix: {
      type: String,
      required: [true, 'Token prefix is required'],
      uppercase: true,
      trim: true,
      maxlength: [3, 'Token prefix must not exceed 3 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Description must not exceed 300 characters'],
    },
    // Average time in minutes to serve one customer at this service
    avgServiceTimeMinutes: {
      type: Number,
      default: 8,
      min: [1, 'Average service time must be at least 1 minute'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0, // Display order
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────
serviceSchema.index({ centerId: 1 });
serviceSchema.index({ centerId: 1, isActive: 1 });
// Ensure token prefix is unique within a center
serviceSchema.index({ centerId: 1, tokenPrefix: 1 }, { unique: true });

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
