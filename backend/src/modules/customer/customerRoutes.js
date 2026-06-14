const express = require('express');
const router = express.Router();
const customerController = require('./customerController');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

const isCustomer = requireRole('customer');

// Customer dashboard stats
router.get('/dashboard', verifyToken, isCustomer, customerController.getDashboard);

// Customer full profile
router.get('/profile', verifyToken, isCustomer, customerController.getProfile);

module.exports = router;
