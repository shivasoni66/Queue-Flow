'use strict';

const { validationResult } = require('express-validator');
const { sendBadRequest } = require('../utils/apiResponse');

/**
 * Middleware: check express-validator results and return 400 if any errors.
 * Place this after your validation chain in route definitions.
 */
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendBadRequest(
      res,
      'Validation failed',
      errors.array().map((e) => ({ field: e.path, message: e.msg }))
    );
  }
  next();
}

module.exports = validate;
