const express = require('express');
const router = express.Router();
const ordersController = require('./ordersController');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

// Customer endpoints
router.post('/', verifyToken, ordersController.createOrder);
router.get('/my-orders', verifyToken, ordersController.getCustomerOrders);
router.get('/:orderId', verifyToken, ordersController.getOrderById);
router.patch('/:orderId/cancel', verifyToken, ordersController.cancelOrder);

// Admin endpoints
const isAdmin = requireRole('admin');
router.get('/', verifyToken, isAdmin, ordersController.getAllOrders);
router.put('/:orderId/status', verifyToken, isAdmin, ordersController.updateOrderStatus);

module.exports = router;
