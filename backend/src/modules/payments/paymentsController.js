const prisma = require('../../config/prisma');

const serializePayment = (payment) => ({
  id: payment.id,
  orderId: payment.orderId,
  customerId: payment.customerId,
  amount: Number(payment.amount) || 0,
  method: String(payment.method || 'CASH_ON_DELIVERY').toLowerCase(),
  status: String(payment.status || 'PENDING').toLowerCase(),
  transactionId: payment.transactionId || null,
  paidAt: payment.paidAt ? (payment.paidAt instanceof Date ? payment.paidAt.toISOString() : payment.paidAt) : null,
  createdAt: payment.createdAt instanceof Date ? payment.createdAt.toISOString() : payment.createdAt,
});

// Create payment
exports.createPayment = async (req, res) => {
  try {
    const { orderId, method } = req.body;

    if (!orderId) return res.status(400).json({ message: 'Order ID is required' });
    if (!method) return res.status(400).json({ message: 'Payment method is required' });

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const validMethods = ['CREDIT_CARD', 'MOBILE_MONEY', 'CASH_ON_DELIVERY', 'BANK_TRANSFER'];
    const methodUpper = String(method).toUpperCase();
    if (!validMethods.includes(methodUpper)) return res.status(400).json({ message: `Method must be one of: ${validMethods.join(', ')}` });

    // Check if payment already exists
    const existing = await prisma.payment.findUnique({ where: { orderId } });
    if (existing) return res.status(400).json({ message: 'Payment already exists for this order' });

    const payment = await prisma.payment.create({
      data: {
        orderId,
        customerId: order.customerId,
        amount: order.totalAmount,
        method: methodUpper,
        status: 'PENDING',
      },
    });

    res.status(201).json({ ok: true, payment: serializePayment(payment) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get payment by order ID
exports.getPaymentByOrderId = async (req, res) => {
  try {
    const { orderId } = req.params;

    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    res.json({ payment: serializePayment(payment) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get payment by ID
exports.getPaymentById = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    res.json({ payment: serializePayment(payment) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update payment status
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { status, transactionId } = req.body;

    if (!status) return res.status(400).json({ message: 'Status is required' });

    const validStatuses = ['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'];
    const statusUpper = String(status).toUpperCase();
    if (!validStatuses.includes(statusUpper)) return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}` });

    const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existing) return res.status(404).json({ message: 'Payment not found' });

    const data = { status: statusUpper };
    if (transactionId) data.transactionId = String(transactionId).trim();
    if (statusUpper === 'COMPLETED' && !existing.paidAt) data.paidAt = new Date();

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data,
    });

    res.json({ ok: true, payment: serializePayment(payment) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Process refund
exports.refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;

    const existing = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!existing) return res.status(404).json({ message: 'Payment not found' });

    if (existing.status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Only completed payments can be refunded' });
    }

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
    });

    res.json({ ok: true, payment: serializePayment(payment), message: 'Refund processed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get customer payments
exports.getCustomerPayments = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ message: 'Unauthorized' });

    const { skip = 0, take = 20, status } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const where = { customerId };
    if (status) where.status = String(status).toUpperCase();

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      payments: payments.map(serializePayment),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all payments (admin)
exports.getAllPayments = async (req, res) => {
  try {
    const { skip = 0, take = 20, status } = req.query;
    const skipNum = Math.max(0, parseInt(skip) || 0);
    const takeNum = Math.min(100, Math.max(1, parseInt(take) || 20));

    const where = {};
    if (status) where.status = String(status).toUpperCase();

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: skipNum,
        take: takeNum,
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      payments: payments.map(serializePayment),
      total,
      skip: skipNum,
      take: takeNum,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
