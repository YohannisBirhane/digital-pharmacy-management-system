const prisma = require('../../config/prisma');

const serializeOrderItem = (item) => ({
  id: item.id,
  orderId: item.orderId,
  medicineId: item.medicineId,
  quantity: Number(item.quantity) || 0,
  price: Number(item.price) || 0,
  medicine: item.medicine ? {
    id: item.medicine.id,
    name: item.medicine.name,
    category: item.medicine.category,
  } : undefined,
});

const serializeOrder = (order) => ({
  id: order.id,
  customerId: order.customerId,
  prescriptionId: order.prescriptionId || null,
  status: String(order.status || 'PENDING').toLowerCase(),
  totalAmount: Number(order.totalAmount) || 0,
  shippingAddress: order.shippingAddress || null,
  createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
  updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : order.updatedAt,
  items: order.items ? order.items.map(serializeOrderItem) : [],
  customer: order.customer ? {
    id: order.customer.id,
    name: order.customer.name,
    email: order.customer.email,
    phone: order.customer.phone,
  } : undefined,
});

// Create order
exports.createOrder = async (req, res) => {
  try {
    const { customerId, prescriptionId, items, shippingAddress } = req.body;

    if (!customerId) return res.status(400).json({ message: 'Customer ID is required' });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Order items are required' });
    if (!shippingAddress) return res.status(400).json({ message: 'Shipping address is required' });

    const customer = await prisma.user.findUnique({ where: { id: customerId } });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    let prescription = null;
    if (prescriptionId) {
      prescription = await prisma.prescription.findUnique({ where: { id: prescriptionId } });
      if (!prescription) return res.status(404).json({ message: 'Prescription not found' });
    }

    let totalAmount = 0;
    const orderItemsData = [];

    for (const item of items) {
      const { medicineId, quantity } = item;
      if (!medicineId || !quantity) return res.status(400).json({ message: 'Each item must have medicineId and quantity' });

      const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
      if (!medicine) return res.status(404).json({ message: `Medicine ${medicineId} not found` });

      const quantityNum = Number(quantity);
      if (!Number.isFinite(quantityNum) || quantityNum <= 0) return res.status(400).json({ message: 'Quantity must be a positive number' });

      const itemTotal = quantityNum * Number(medicine.price);
      totalAmount += itemTotal;

      orderItemsData.push({
        medicineId,
        quantity: quantityNum,
        price: Number(medicine.price),
      });
    }

    const order = await prisma.order.create({
      data: {
        customerId,
        prescriptionId: prescriptionId || null,
        status: 'PENDING',
        totalAmount,
        shippingAddress: String(shippingAddress).trim(),
        items: {
          createMany: {
            data: orderItemsData,
          },
        },
      },
      include: { items: { include: { medicine: true } }, customer: true },
    });

    res.status(201).json({ ok: true, order: serializeOrder(order) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get customer's orders
exports.getCustomerOrders = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ message: 'Unauthorized' });

    const { skip = 0, take = 20, status } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const where = { customerId };
    if (status) where.status = String(status).toUpperCase();

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { items: { include: { medicine: true } }, customer: true },
        orderBy: { createdAt: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders: orders.map(serializeOrder),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { medicine: true } }, customer: true, payment: true },
    });

    if (!order) return res.status(404).json({ message: 'Order not found' });

    // Check access: customer can only see their own orders
    if (req.user?.id && req.user.id !== order.customerId) {
      const role = String(req.user.role || '').toLowerCase();
      if (role !== 'admin') return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ order: serializeOrder(order) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!status) return res.status(400).json({ message: 'Status is required' });

    const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];
    const statusUpper = String(status).toUpperCase();
    if (!validStatuses.includes(statusUpper)) return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}` });

    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { medicine: true } }, customer: true },
    });

    if (!existing) return res.status(404).json({ message: 'Order not found' });

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: statusUpper },
      include: { items: { include: { medicine: true } }, customer: true },
    });

    res.json({ ok: true, order: serializeOrder(order) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Cancel order
exports.cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const existing = await prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) return res.status(404).json({ message: 'Order not found' });

    if (existing.status !== 'PENDING') {
      return res.status(400).json({ message: 'Only pending orders can be cancelled' });
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
      include: { items: { include: { medicine: true } }, customer: true },
    });

    res.json({ ok: true, order: serializeOrder(order) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all orders (admin)
exports.getAllOrders = async (req, res) => {
  try {
    const { skip = 0, take = 20, status } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const where = {};
    if (status) where.status = String(status).toUpperCase();

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { items: { include: { medicine: true } }, customer: true },
        orderBy: { createdAt: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders: orders.map(serializeOrder),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
