'use strict';

const mongoose = require('mongoose');

/**
 * Stores wait-time / footfall predictions.
 * Initially populated by the formula-based waitTimeService;
 * later replaced by the Python AI service output.
 */
const predictionSchema = new mongoose.Schema(
  {
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceCenter',
      required: true,
    },
    // Date string YYYY-MM-DD
    date: {
      type: String,
      required: true,
    },
    // Hour of day 0–23
    hour: {
      type: Number,
      required: true,
      min: 0,
      max: 23,
    },
    predictedFootfall: {
      type: Number,
      min: 0,
    },
    predictedWaitMinutes: {
      type: Number,
      min: 0,
    },
    suggestedCounterCount: {
      type: Number,
      min: 0,
    },
    // Source of this prediction
    source: {
      type: String,
      enum: ['FORMULA', 'AI', 'HISTORICAL'],
      default: 'FORMULA',
    },
    // Confidence score 0–1 (only set by AI service)
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ─── Indexes ──────────────────────────────────────
predictionSchema.index({ centerId: 1, date: 1, hour: 1 }, { unique: true });
predictionSchema.index({ centerId: 1, date: 1 });

const Prediction = mongoose.model('Prediction', predictionSchema);

module.exports = Prediction;
