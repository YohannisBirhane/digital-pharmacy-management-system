const prisma = require('../../config/prisma');

const serializeMedicine = (medicine) => ({
  id: medicine.id,
  name: medicine.name,
  description: medicine.description || null,
  category: medicine.category || null,
  manufacturer: medicine.manufacturer || null,
  price: Number(medicine.price) || 0,
  prescriptionReq: Boolean(medicine.prescriptionReq),
  barcode: medicine.barcode || null,
  imageUrl: medicine.imageUrl || null,
  createdAt: medicine.createdAt instanceof Date ? medicine.createdAt.toISOString() : medicine.createdAt,
  updatedAt: medicine.updatedAt instanceof Date ? medicine.updatedAt.toISOString() : medicine.updatedAt,
});

// Get all medicines with optional filtering and pagination
exports.getAllMedicines = async (req, res) => {
  try {
    const { category, prescriptionOnly, search, skip = 0, take = 20 } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const where = {};
    if (category) where.category = String(category).trim();
    if (prescriptionOnly === 'true') where.prescriptionReq = true;
    if (search) {
      where.OR = [
        { name: { contains: String(search).trim(), mode: 'insensitive' } },
        { description: { contains: String(search).trim(), mode: 'insensitive' } },
        { manufacturer: { contains: String(search).trim(), mode: 'insensitive' } },
      ];
    }

    const [medicines, total] = await Promise.all([
      prisma.medicine.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.medicine.count({ where }),
    ]);

    res.json({
      medicines: medicines.map(serializeMedicine),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get medicine by ID
exports.getMedicineById = async (req, res) => {
  try {
    const { medicineId } = req.params;
    const medicine = await prisma.medicine.findUnique({
      where: { id: medicineId },
    });

    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
    res.json({ medicine: serializeMedicine(medicine) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get medicine by barcode
exports.getMedicineByBarcode = async (req, res) => {
  try {
    const { barcode } = req.query;
    if (!barcode) return res.status(400).json({ message: 'Barcode is required' });

    const medicine = await prisma.medicine.findUnique({
      where: { barcode: String(barcode).trim() },
    });

    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
    res.json({ medicine: serializeMedicine(medicine) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Create medicine (admin only)
exports.createMedicine = async (req, res) => {
  try {
    const { name, description, category, manufacturer, price, prescriptionReq, barcode, imageUrl } = req.body;

    if (!name) return res.status(400).json({ message: 'Medicine name is required' });
    if (price === undefined || price === null) return res.status(400).json({ message: 'Price is required' });

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0) return res.status(400).json({ message: 'Price must be a valid non-negative number' });

    if (barcode) {
      const existing = await prisma.medicine.findUnique({ where: { barcode } });
      if (existing) return res.status(400).json({ message: 'Barcode already exists' });
    }

    const medicine = await prisma.medicine.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        category: category ? String(category).trim() : null,
        manufacturer: manufacturer ? String(manufacturer).trim() : null,
        price: priceNum,
        prescriptionReq: Boolean(prescriptionReq),
        barcode: barcode ? String(barcode).trim() : null,
        imageUrl: imageUrl ? String(imageUrl).trim() : null,
      },
    });

    res.status(201).json({ ok: true, medicine: serializeMedicine(medicine) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update medicine (admin only)
exports.updateMedicine = async (req, res) => {
  try {
    const { medicineId } = req.params;
    const { name, description, category, manufacturer, price, prescriptionReq, barcode, imageUrl } = req.body;

    const existing = await prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!existing) return res.status(404).json({ message: 'Medicine not found' });

    const data = {};
    if (name) data.name = String(name).trim();
    if (description !== undefined) data.description = description ? String(description).trim() : null;
    if (category !== undefined) data.category = category ? String(category).trim() : null;
    if (manufacturer !== undefined) data.manufacturer = manufacturer ? String(manufacturer).trim() : null;
    if (price !== undefined) {
      const priceNum = Number(price);
      if (!Number.isFinite(priceNum) || priceNum < 0) return res.status(400).json({ message: 'Price must be a valid non-negative number' });
      data.price = priceNum;
    }
    if (prescriptionReq !== undefined) data.prescriptionReq = Boolean(prescriptionReq);
    if (barcode !== undefined) {
      if (barcode && barcode !== existing.barcode) {
        const duplicate = await prisma.medicine.findUnique({ where: { barcode } });
        if (duplicate) return res.status(400).json({ message: 'Barcode already exists' });
      }
      data.barcode = barcode ? String(barcode).trim() : null;
    }
    if (imageUrl !== undefined) data.imageUrl = imageUrl ? String(imageUrl).trim() : null;

    if (Object.keys(data).length === 0) return res.status(400).json({ message: 'No fields to update' });

    const medicine = await prisma.medicine.update({
      where: { id: medicineId },
      data,
    });

    res.json({ ok: true, medicine: serializeMedicine(medicine) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Delete medicine (admin only)
exports.deleteMedicine = async (req, res) => {
  try {
    const { medicineId } = req.params;
    const existing = await prisma.medicine.findUnique({ where: { id: medicineId } });
    if (!existing) return res.status(404).json({ message: 'Medicine not found' });

    await prisma.medicine.delete({ where: { id: medicineId } });
    res.json({ ok: true, message: 'Medicine deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
