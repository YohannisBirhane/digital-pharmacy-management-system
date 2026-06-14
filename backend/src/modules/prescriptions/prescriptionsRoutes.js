const express = require('express');
const router = express.Router();
const prescriptionsController = require('./prescriptionsController');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

// Customer endpoints
router.post('/', verifyToken, prescriptionsController.uploadPrescription);
router.get('/my-prescriptions', verifyToken, prescriptionsController.getCustomerPrescriptions);
router.get('/:prescriptionId', verifyToken, prescriptionsController.getPrescriptionById);

// Pharmacist/Admin endpoints
const isPharmacistOrAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const role = String(req.user.role || '').toLowerCase();
  if (!['pharmacist', 'admin'].includes(role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};

router.get('/pending', verifyToken, isPharmacistOrAdmin, prescriptionsController.getPendingPrescriptions);
router.patch('/:prescriptionId/approve', verifyToken, isPharmacistOrAdmin, prescriptionsController.approvePrescription);
router.patch('/:prescriptionId/reject', verifyToken, isPharmacistOrAdmin, prescriptionsController.rejectPrescription);

// Admin endpoints
const isAdmin = requireRole('admin');
router.get('/', verifyToken, isAdmin, prescriptionsController.getAllPrescriptions);

module.exports = router;
