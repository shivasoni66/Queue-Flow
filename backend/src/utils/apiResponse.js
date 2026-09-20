'use strict';

/**
 * Standardized API response helpers.
 * All responses follow the shape:
 *   { success: boolean, message?: string, data?: any, meta?: any }
 */

/**
 * Send a successful response.
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number}  [options.statusCode=200]
 * @param {string}  [options.message='Success']
 * @param {*}       [options.data]
 * @param {object}  [options.meta]  - pagination, counts, etc.
 */
function sendSuccess(res, { statusCode = 200, message = 'Success', data, meta } = {}) {
  const body = { success: true, message };
  if (data !== undefined) body.data = data;
  if (meta !== undefined) body.meta = meta;
  return res.status(statusCode).json(body);
}

/**
 * Send an error response.
 * @param {import('express').Response} res
 * @param {object} options
 * @param {number}  [options.statusCode=500]
 * @param {string}  [options.message='Internal server error']
 * @param {Array}   [options.errors]  - validation error details
 */
function sendError(res, { statusCode = 500, message = 'Internal server error', errors } = {}) {
  const body = { success: false, message };
  if (errors !== undefined) body.errors = errors;
  return res.status(statusCode).json(body);
}

/**
 * Send a 201 Created response.
 */
function sendCreated(res, { message = 'Created', data, meta } = {}) {
  return sendSuccess(res, { statusCode: 201, message, data, meta });
}

/**
 * Send a 404 Not Found response.
 */
function sendNotFound(res, message = 'Resource not found') {
  return sendError(res, { statusCode: 404, message });
}

/**
 * Send a 400 Bad Request response.
 */
function sendBadRequest(res, message = 'Bad request', errors) {
  return sendError(res, { statusCode: 400, message, errors });
}

/**
 * Send a 401 Unauthorized response.
 */
function sendUnauthorized(res, message = 'Unauthorized') {
  return sendError(res, { statusCode: 401, message });
}

/**
 * Send a 403 Forbidden response.
 */
function sendForbidden(res, message = 'Forbidden') {
  return sendError(res, { statusCode: 403, message });
}

/**
 * Send a 409 Conflict response.
 */
function sendConflict(res, message = 'Conflict') {
  return sendError(res, { statusCode: 409, message });
}

module.exports = {
  sendSuccess,
  sendError,
  sendCreated,
  sendNotFound,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendConflict,
};
