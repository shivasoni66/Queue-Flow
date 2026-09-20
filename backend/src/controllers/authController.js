'use strict';

const { body } = require('express-validator');
const User = require('../models/User');
const { signToken } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const {
  sendSuccess,
  sendCreated,
  sendBadRequest,
  sendUnauthorized,
  sendConflict,
} = require('../utils/apiResponse');

// ─── Validation rules ─────────────────────────────
const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2–80 characters'),
  body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and a number'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
];

const loginValidation = [
  body('email').trim().isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ─── Controllers ──────────────────────────────────

/**
 * POST /api/auth/register
 * Register a new customer account.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  // Check if email already exists
  const existing = await User.findOne({ email });
  if (existing) {
    return sendConflict(res, 'An account with this email already exists');
  }

  const passwordHash = await User.hashPassword(password);

  const user = await User.create({
    name,
    email,
    phone: phone || undefined,
    passwordHash,
    role: 'CUSTOMER',
  });

  const token = signToken(user._id.toString());

  return sendCreated(res, {
    message: 'Registration successful',
    data: {
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        preferences: user.preferences,
      },
    },
  });
});

/**
 * POST /api/auth/login
 * Authenticate a user and return a JWT.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Fetch user including passwordHash (select: false by default)
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    return sendUnauthorized(res, 'Invalid email or password');
  }

  if (!user.isActive) {
    return sendUnauthorized(res, 'Your account has been deactivated');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    return sendUnauthorized(res, 'Invalid email or password');
  }

  // Update last login time
  await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

  const token = signToken(user._id.toString());

  return sendSuccess(res, {
    message: 'Login successful',
    data: {
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        preferences: user.preferences,
      },
    },
  });
});

/**
 * GET /api/auth/me
 * Return the currently authenticated user.
 * Requires: protect middleware
 */
const getMe = asyncHandler(async (req, res) => {
  return sendSuccess(res, {
    data: {
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
        role: req.user.role,
        preferences: req.user.preferences,
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin,
      },
    },
  });
});

/**
 * PATCH /api/auth/me
 * Update profile (name, phone, preferences, fcmToken).
 */
const updateMe = asyncHandler(async (req, res) => {
  const allowedFields = ['name', 'phone', 'preferences', 'fcmToken'];
  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  return sendSuccess(res, {
    message: 'Profile updated',
    data: { user },
  });
});

/**
 * POST /api/auth/logout
 * Client-side logout (JWT is stateless; this just acknowledges).
 * For a full implementation, maintain a token blacklist or use short-lived tokens.
 */
const logout = asyncHandler(async (_req, res) => {
  return sendSuccess(res, { message: 'Logged out successfully' });
});

module.exports = {
  register,
  login,
  getMe,
  updateMe,
  logout,
  registerValidation,
  loginValidation,
};
