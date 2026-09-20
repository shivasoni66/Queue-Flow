'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name must not exceed 80 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[1-9]\d{6,14}$/, 'Please provide a valid phone number'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // Never returned in queries by default
    },
    role: {
      type: String,
      enum: ['CUSTOMER', 'STAFF', 'ADMIN'],
      default: 'CUSTOMER',
    },
    rfidUid: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    fcmToken: {
      type: String,
      default: null,
    },
    preferences: {
      notifyApp: { type: Boolean, default: true },
      notifySms: { type: Boolean, default: false },
      notifyAheadCount: { type: Number, default: 5 }, // Notify when N people ahead
      language: { type: String, default: 'en' },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// ─── Indexes ──────────────────────────────────────
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ role: 1 });

// ─── Instance methods ─────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// ─── Static methods ───────────────────────────────
userSchema.statics.hashPassword = async function (plainPassword) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plainPassword, salt);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
