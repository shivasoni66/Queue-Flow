'use strict';

const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  register,
  login,
  getMe,
  updateMe,
  logout,
  changePassword,
  registerValidation,
  loginValidation,
  changePasswordValidation,
  updateMeValidation,
} = require('../controllers/authController');

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many password change attempts, please try again later.' },
});

router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.post('/logout', protect, logout);
router.post('/change-password', protect, passwordChangeLimiter, changePasswordValidation, validate, changePassword);
router.get('/me', protect, getMe);
router.patch('/me', protect, updateMeValidation, validate, updateMe);

module.exports = router;
