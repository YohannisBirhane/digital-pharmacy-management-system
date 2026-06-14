const prisma = require('../../config/prisma');

const serializePrescription = (prescription) => ({
  id: prescription.id,
  customerId: prescription.customerId,
  imageUrl: prescription.imageUrl,
  status: String(prescription.status || 'PENDING').toLowerCase(),
  notes: prescription.notes || null,
  uploadedAt: prescription.uploadedAt instanceof Date ? prescription.uploadedAt.toISOString() : prescription.uploadedAt,
  reviewedAt: prescription.reviewedAt ? (prescription.reviewedAt instanceof Date ? prescription.reviewedAt.toISOString() : prescription.reviewedAt) : null,
  customer: prescription.customer ? {
    id: prescription.customer.id,
    name: prescription.customer.name,
    email: prescription.customer.email,
    phone: prescription.customer.phone,
  } : undefined,
});

// Upload prescription
exports.uploadPrescription = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ message: 'Unauthorized' });

    const { imageUrl } = req.body;
    if (!imageUrl) return res.status(400).json({ message: 'Image URL is required' });

    const prescription = await prisma.prescription.create({
      data: {
        customerId,
        imageUrl: String(imageUrl).trim(),
        status: 'PENDING',
      },
      include: { customer: true },
    });

    res.status(201).json({ ok: true, prescription: serializePrescription(prescription) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get customer prescriptions
exports.getCustomerPrescriptions = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ message: 'Unauthorized' });

    const { skip = 0, take = 20, status } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const where = { customerId };
    if (status) where.status = String(status).toUpperCase();

    const [prescriptions, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        include: { customer: true },
        orderBy: { uploadedAt: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.prescription.count({ where }),
    ]);

    res.json({
      prescriptions: prescriptions.map(serializePrescription),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get prescription by ID
exports.getPrescriptionById = async (req, res) => {
  try {
    const { prescriptionId } = req.params;

    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { customer: true, orders: true },
    });

    if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

    // Check access: customer can only see their own prescriptions
    if (req.user?.id && req.user.id !== prescription.customerId) {
      const role = String(req.user.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'pharmacist') return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ prescription: serializePrescription(prescription) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Approve prescription
exports.approvePrescription = async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const { notes } = req.body;

    const existing = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { customer: true },
    });

    if (!existing) return res.status(404).json({ message: 'Prescription not found' });

    const prescription = await prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        status: 'APPROVED',
        notes: notes ? String(notes).trim() : existing.notes,
        reviewedAt: new Date(),
      },
      include: { customer: true },
    });

    res.json({ ok: true, prescription: serializePrescription(prescription) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Reject prescription
exports.rejectPrescription = async (req, res) => {
  try {
    const { prescriptionId } = req.params;
    const { notes } = req.body;

    if (!notes) return res.status(400).json({ message: 'Rejection reason is required' });

    const existing = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: { customer: true },
    });

    if (!existing) return res.status(404).json({ message: 'Prescription not found' });

    const prescription = await prisma.prescription.update({
      where: { id: prescriptionId },
      data: {
        status: 'REJECTED',
        notes: String(notes).trim(),
        reviewedAt: new Date(),
      },
      include: { customer: true },
    });

    res.json({ ok: true, prescription: serializePrescription(prescription) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get pending prescriptions (pharmacist/admin)
exports.getPendingPrescriptions = async (req, res) => {
  try {
    const { skip = 0, take = 20 } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const [prescriptions, total] = await Promise.all([
      prisma.prescription.findMany({
        where: { status: 'PENDING' },
        include: { customer: true },
        orderBy: { uploadedAt: 'asc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.prescription.count({ where: { status: 'PENDING' } }),
    ]);

    res.json({
      prescriptions: prescriptions.map(serializePrescription),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all prescriptions (admin)
exports.getAllPrescriptions = async (req, res) => {
  try {
    const { skip = 0, take = 20, status } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const where = {};
    if (status) where.status = String(status).toUpperCase();

    const [prescriptions, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        include: { customer: true },
        orderBy: { uploadedAt: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.prescription.count({ where }),
    ]);

    res.json({
      prescriptions: prescriptions.map(serializePrescription),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
