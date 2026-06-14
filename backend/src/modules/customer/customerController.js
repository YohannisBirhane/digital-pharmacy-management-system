const prisma = require('../../config/prisma');

// GET /customer/dashboard - Returns stats for the logged-in customer
exports.getDashboard = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ message: 'Unauthorized' });

    const [
      totalOrders,
      pendingOrders,
      deliveredOrders,
      cancelledOrders,
      totalPrescriptions,
      pendingPrescriptions,
      approvedPrescriptions,
      recentOrders,
      totalSpentResult,
    ] = await Promise.all([
      prisma.order.count({ where: { customerId } }),
      prisma.order.count({ where: { customerId, status: 'PENDING' } }),
      prisma.order.count({ where: { customerId, status: 'DELIVERED' } }),
      prisma.order.count({ where: { customerId, status: 'CANCELLED' } }),
      prisma.prescription.count({ where: { customerId } }),
      prisma.prescription.count({ where: { customerId, status: 'PENDING' } }),
      prisma.prescription.count({ where: { customerId, status: 'APPROVED' } }),
      prisma.order.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          items: { include: { medicine: true } },
          payment: true,
        },
      }),
      prisma.order.aggregate({
        where: { customerId, status: { in: ['DELIVERED', 'SHIPPED', 'PROCESSING'] } },
        _sum: { totalAmount: true },
      }),
    ]);

    const totalSpent = Number(totalSpentResult._sum.totalAmount) || 0;

    const serializeOrder = (order) => ({
      id: order.id,
      status: String(order.status).toLowerCase(),
      totalAmount: Number(order.totalAmount) || 0,
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
      itemCount: order.items ? order.items.length : 0,
      paymentStatus: order.payment ? String(order.payment.status).toLowerCase() : null,
      items: order.items
        ? order.items.slice(0, 3).map((item) => ({
            medicineName: item.medicine?.name || 'Unknown',
            quantity: Number(item.quantity),
            price: Number(item.price),
          }))
        : [],
    });

    res.json({
      stats: {
        totalOrders,
        pendingOrders,
        deliveredOrders,
        cancelledOrders,
        totalPrescriptions,
        pendingPrescriptions,
        approvedPrescriptions,
        totalSpent,
      },
      recentOrders: recentOrders.map(serializeOrder),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /customer/profile - Get full profile with stats
exports.getProfile = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) return res.status(401).json({ message: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        verificationStatus: true,
        createdAt: true,
      },
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({ profile: { ...user, role: String(user.role).toLowerCase() } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
