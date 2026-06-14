const express = require('express');
const router = express.Router();
const inventoryController = require('./inventoryController');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

// Public endpoints
router.get('/low-stock', inventoryController.getLowStockItems);
router.get('/expiring-soon', inventoryController.getExpiringItems);

// Branch-specific inventory
const isPharmacistOrAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  const role = String(req.user.role || '').toLowerCase();
  if (!['pharmacist', 'admin'].includes(role)) return res.status(403).json({ message: 'Forbidden' });
  next();
};

router.get('/:branchId', verifyToken, isPharmacistOrAdmin, inventoryController.getBranchInventory);
router.get('/:branchId/:medicineId', verifyToken, isPharmacistOrAdmin, inventoryController.getInventoryItem);
router.put('/:branchId/:medicineId', verifyToken, isPharmacistOrAdmin, inventoryController.updateStock);
router.patch('/:branchId/:medicineId/adjust', verifyToken, isPharmacistOrAdmin, inventoryController.adjustStock);

module.exports = router;
