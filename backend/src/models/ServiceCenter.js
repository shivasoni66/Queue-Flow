'use strict';

const mongoose = require('mongoose');

const operatingHoursSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
      required: true,
    },
    open: { type: String, default: '09:00' },  // HH:MM 24h
    close: { type: String, default: '17:00' },
    isClosed: { type: Boolean, default: false },
  },
  { _id: false }
);

const serviceCenterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Service center name is required'],
      trim: true,
      maxlength: [120, 'Name must not exceed 120 characters'],
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [20, 'Code must not exceed 20 characters'],
    },
    type: {
      type: String,
      required: true,
      enum: ['BANK', 'HOSPITAL', 'GOVT', 'RAILWAY', 'SUPPORT', 'OTHER'],
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    capacity: {
      type: Number,
      required: [true, 'Capacity is required'],
      min: [1, 'Capacity must be at least 1'],
      default: 200,
    },
    // Crowd capacity alert threshold (0–100 %)
    capacityAlertThreshold: {
      type: Number,
      default: 80,
      min: 0,
      max: 100,
    },
    isOpen: {
      type: Boolean,
      default: true,
    },
    operatingHours: [operatingHoursSchema],
    // No-show timeout in seconds (how long to wait after calling before marking expired)
    noShowTimeoutSeconds: {
      type: Number,
      default: 120,
    },
    // Current crowd count — updated by IoT events
    currentCrowd: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// ─── Virtuals ─────────────────────────────────────
serviceCenterSchema.virtual('crowdPercent').get(function () {
  if (!this.capacity) return 0;
  return Math.round((this.currentCrowd / this.capacity) * 100);
});

serviceCenterSchema.virtual('crowdStatus').get(function () {
  const pct = this.crowdPercent;
  if (pct >= 80) return 'HIGH';
  if (pct >= 50) return 'MODERATE';
  return 'LOW';
});

// ─── Indexes ──────────────────────────────────────
serviceCenterSchema.index({ type: 1 });
serviceCenterSchema.index({ isOpen: 1 });

const ServiceCenter = mongoose.model('ServiceCenter', serviceCenterSchema);

module.exports = ServiceCenter;
