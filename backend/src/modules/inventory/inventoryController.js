const prisma = require('../../config/prisma');

const serializeInventory = (item) => ({
  id: item.id,
  branchId: item.branchId,
  medicineId: item.medicineId,
  quantity: Number(item.quantity) || 0,
  batchNumber: item.batchNumber || null,
  expiryDate: item.expiryDate instanceof Date ? item.expiryDate.toISOString() : item.expiryDate,
  lastUpdated: item.lastUpdated instanceof Date ? item.lastUpdated.toISOString() : item.lastUpdated,
  medicine: item.medicine ? {
    id: item.medicine.id,
    name: item.medicine.name,
    category: item.medicine.category,
    price: Number(item.medicine.price),
  } : undefined,
  branch: item.branch ? {
    id: item.branch.id,
    name: item.branch.name,
    city: item.branch.city,
  } : undefined,
});

// Get inventory for a branch
exports.getBranchInventory = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { skip = 0, take = 20, lowStockOnly = false, expiringSoon = false } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const where = { branchId };

    if (lowStockOnly === 'true') {
      where.quantity = { lte: 10 };
    }

    if (expiringSoon === 'true') {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      where.expiryDate = {
        lte: thirtyDaysFromNow,
        gte: new Date(),
      };
    }

    const [inventory, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: { medicine: true, branch: true },
        orderBy: { lastUpdated: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.inventory.count({ where }),
    ]);

    res.json({
      inventory: inventory.map(serializeInventory),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get inventory by medicine and branch
exports.getInventoryItem = async (req, res) => {
  try {
    const { branchId, medicineId } = req.params;

    const item = await prisma.inventory.findFirst({
      where: { branchId, medicineId },
      include: { medicine: true, branch: true },
    });

    if (!item) return res.status(404).json({ message: 'Inventory item not found' });
    res.json({ item: serializeInventory(item) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Add or update stock (admin/pharmacist)
exports.updateStock = async (req, res) => {
  try {
    const { branchId, medicineId } = req.params;
    const { quantity, batchNumber, expiryDate } = req.body;

    if (quantity === undefined) return res.status(400).json({ message: 'Quantity is required' });
    const quantityNum = Number(quantity);
    if (!Number.isFinite(quantityNum) || quantityNum < 0) return res.status(400).json({ message: 'Quantity must be a non-negative number' });

    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });

    const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });

    let expiryDateParsed = null;
    if (expiryDate) {
      expiryDateParsed = new Date(expiryDate);
      if (Number.isNaN(expiryDateParsed.getTime())) {
        return res.status(400).json({ message: 'Invalid expiry date format' });
      }
    }

    const item = await prisma.inventory.upsert({
      where: { branchId_medicineId_batchNumber: { branchId, medicineId, batchNumber: batchNumber || null } },
      update: {
        quantity: quantityNum,
        expiryDate: expiryDateParsed,
        lastUpdated: new Date(),
      },
      create: {
        branchId,
        medicineId,
        quantity: quantityNum,
        batchNumber: batchNumber || null,
        expiryDate: expiryDateParsed,
        lastUpdated: new Date(),
      },
      include: { medicine: true, branch: true },
    });

    res.json({ ok: true, item: serializeInventory(item) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Adjust stock (increment/decrement)
exports.adjustStock = async (req, res) => {
  try {
    const { branchId, medicineId } = req.params;
    const { adjustment } = req.body;

    if (adjustment === undefined || adjustment === null) return res.status(400).json({ message: 'Adjustment amount is required' });
    const adjustmentNum = Number(adjustment);
    if (!Number.isFinite(adjustmentNum)) return res.status(400).json({ message: 'Adjustment must be a number' });

    const item = await prisma.inventory.findFirst({
      where: { branchId, medicineId },
      include: { medicine: true, branch: true },
    });

    if (!item) return res.status(404).json({ message: 'Inventory item not found' });

    const newQuantity = item.quantity + adjustmentNum;
    if (newQuantity < 0) return res.status(400).json({ message: 'Insufficient stock for this adjustment' });

    const updated = await prisma.inventory.update({
      where: { id: item.id },
      data: {
        quantity: newQuantity,
        lastUpdated: new Date(),
      },
      include: { medicine: true, branch: true },
    });

    res.json({ ok: true, item: serializeInventory(updated) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get low stock items across all branches
exports.getLowStockItems = async (req, res) => {
  try {
    const { threshold = 10, branchId } = req.query;
    const thresholdNum = Math.max(0, parseInt(threshold) || 10);

    const where = { quantity: { lte: thresholdNum } };
    if (branchId) where.branchId = String(branchId).trim();

    const items = await prisma.inventory.findMany({
      where,
      include: { medicine: true, branch: true },
      orderBy: { quantity: 'asc' },
      take: 100,
    });

    res.json({
      items: items.map(serializeInventory),
      threshold: thresholdNum,
      total: items.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get items expiring soon
exports.getExpiringItems = async (req, res) => {
  try {
    const { daysAhead = 30 } = req.query;
    const daysNum = Math.max(1, parseInt(daysAhead) || 30);

    const expiryThreshold = new Date();
    expiryThreshold.setDate(expiryThreshold.getDate() + daysNum);

    const items = await prisma.inventory.findMany({
      where: {
        expiryDate: {
          lte: expiryThreshold,
          gte: new Date(),
        },
      },
      include: { medicine: true, branch: true },
      orderBy: { expiryDate: 'asc' },
      take: 100,
    });

    res.json({
      items: items.map(serializeInventory),
      daysAhead: daysNum,
      total: items.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
