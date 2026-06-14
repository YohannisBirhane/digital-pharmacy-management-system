const express = require('express');
const router = express.Router();
const authController = require('./authController');
const { verifyToken } = require('../../middleware/authMiddleware');

// Pharmacist registration (requires license, national ID, pharmacy info)
router.post('/register', authController.register);
// Customer self-registration (name, email, password, optional phone)
router.post('/register/customer', authController.registerCustomer);

router.post('/login', authController.login);
router.post('/logout', verifyToken, authController.logout);
router.get('/me', verifyToken, authController.me);
router.put('/me', verifyToken, authController.updateProfile);
router.post('/change-password', verifyToken, authController.changePassword);
router.post('/resend-verification', authController.resendVerification);
router.post('/verify-email', authController.verifyEmail);
router.post('/forgot-password', authController.requestPasswordReset);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
