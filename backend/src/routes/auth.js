'use strict';

const router = require('express').Router();
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  register, login, getMe, updateMe, logout,
  registerValidation, loginValidation,
} = require('../controllers/authController');

router.post('/register', registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);

module.exports = router;
