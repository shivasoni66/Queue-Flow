'use strict';

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendUnauthorized, sendForbidden } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Middleware: verify JWT and attach the authenticated user to req.user.
 * Expects Authorization: Bearer <token> header.
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return sendUnauthorized(res, 'No authentication token provided');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return sendUnauthorized(res, 'Token has expired. Please log in again.');
    }
    return sendUnauthorized(res, 'Invalid authentication token');
  }

  const user = await User.findById(decoded.id).select('-passwordHash');

  if (!user) {
    return sendUnauthorized(res, 'User account not found');
  }

  if (!user.isActive) {
    return sendUnauthorized(res, 'Your account has been deactivated');
  }

  // Token version verification: strict equality required.
  // Missing, old, higher/future, or non-numeric tokenVersion must be rejected.
  const currentVersion = user.tokenVersion !== undefined ? user.tokenVersion : 0;
  if (
    typeof decoded.tokenVersion !== 'number' ||
    decoded.tokenVersion !== currentVersion
  ) {
    return sendUnauthorized(res, 'Session has expired or been revoked. Please log in again.');
  }

  req.user = user;
  next();
});

/**
 * Middleware factory: restrict access to specific roles.
 * Must be used after `protect`.
 *
 * @param {...string} roles - Allowed roles (e.g. 'ADMIN', 'STAFF')
 * @returns Express middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Authentication required');
    }
    if (!roles.includes(req.user.role)) {
      return sendForbidden(
        res,
        `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`
      );
    }
    next();
  };
}

/**
 * Middleware: validate IoT device secret.
 * IoT devices authenticate with a shared secret in the X-IoT-Secret header.
 */
function iotSecret(req, res, next) {
  const secret = req.headers['x-iot-secret'];
  if (!secret || secret !== process.env.IOT_SECRET) {
    return sendUnauthorized(res, 'Invalid IoT device secret');
  }
  next();
}

/**
 * Sign a JWT token for a user with server-authoritative role claim and token version.
 * @param {string} userId - MongoDB ObjectId string
 * @param {string} [role='CUSTOMER'] - User role (CUSTOMER, STAFF, ADMIN)
 * @param {number} [tokenVersion=0] - Session token version for revocation
 * @returns {string} JWT
 */
function signToken(userId, role = 'CUSTOMER', tokenVersion = 0) {
  const payload = {
    id: userId,
    role: (typeof role === 'string' && role) ? role : 'CUSTOMER',
    tokenVersion: typeof tokenVersion === 'number' ? tokenVersion : 0,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

module.exports = { protect, requireRole, iotSecret, signToken };
