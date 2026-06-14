const express = require('express');
const router = express.Router();
const paymentsController = require('./paymentsController');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

// Customer endpoints
router.post('/', verifyToken, paymentsController.createPayment);
router.get('/my-payments', verifyToken, paymentsController.getCustomerPayments);
router.get('/order/:orderId', verifyToken, paymentsController.getPaymentByOrderId);
router.get('/:paymentId', verifyToken, paymentsController.getPaymentById);

// Admin endpoints
const isAdmin = requireRole('admin');
router.get('/', verifyToken, isAdmin, paymentsController.getAllPayments);
router.patch('/:paymentId/status', verifyToken, isAdmin, paymentsController.updatePaymentStatus);
router.post('/:paymentId/refund', verifyToken, isAdmin, paymentsController.refundPayment);

module.exports = router;
