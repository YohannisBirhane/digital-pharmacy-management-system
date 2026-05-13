const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

// Admin middleware check
const isAdmin = requireRole('admin');

// Dashboard
router.get('/dashboard', verifyToken, isAdmin, adminController.getDashboard);

// Users Management
router.get('/users', verifyToken, isAdmin, adminController.getAllUsers);
router.get('/users/:userId', verifyToken, isAdmin, adminController.getUser);
router.post('/users', verifyToken, isAdmin, adminController.createUser);
router.put('/users/:userId', verifyToken, isAdmin, adminController.updateUser);
router.delete('/users/:userId', verifyToken, isAdmin, adminController.deleteUser);

// Pharmacists Management
router.get('/pharmacists', verifyToken, isAdmin, adminController.getPharmacists);

// Branch Management
router.get('/branches', verifyToken, isAdmin, adminController.getBranches);
router.post('/branches', verifyToken, isAdmin, adminController.createBranch);

// System Configuration
router.get('/config', verifyToken, isAdmin, adminController.getSystemConfig);
router.put('/config', verifyToken, isAdmin, adminController.updateSystemConfig);

// Reports
router.get('/reports', verifyToken, isAdmin, adminController.getReports);

// Audit Logs
router.get('/audit-logs', verifyToken, isAdmin, adminController.getAuditLogs);

// Analytics
router.get('/analytics', verifyToken, isAdmin, adminController.getAnalytics);

module.exports = router;
