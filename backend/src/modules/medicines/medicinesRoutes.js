const express = require('express');
const router = express.Router();
const medicinesController = require('./medicinesController');
const { verifyToken, requireRole } = require('../../middleware/authMiddleware');

// Public endpoints
router.get('/', medicinesController.getAllMedicines);
router.get('/barcode', medicinesController.getMedicineByBarcode);
router.get('/:medicineId', medicinesController.getMedicineById);

// Admin endpoints
const isAdmin = requireRole('admin');
router.post('/', verifyToken, isAdmin, medicinesController.createMedicine);
router.put('/:medicineId', verifyToken, isAdmin, medicinesController.updateMedicine);
router.delete('/:medicineId', verifyToken, isAdmin, medicinesController.deleteMedicine);

module.exports = router;
