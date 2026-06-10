const bcrypt = require('bcryptjs');
const prisma = require('../config/prisma');

const normalizeRole = (role, fallback = 'customer') => {
  if (typeof role !== 'string' || role.trim() === '') return fallback;
  return role.toLowerCase();
};

const normalizeVerificationStatus = (status, fallback = 'pending') => {
  if (typeof status !== 'string' || status.trim() === '') return fallback;
  return status.toLowerCase();
};

const normalizeBranchStatus = (status, fallback = 'active') => {
  if (typeof status !== 'string' || status.trim() === '') return fallback;
  return status.toLowerCase();
};

const serializeUser = (user) => {
  const role = normalizeRole(user.role);
  const emailVerified = role !== 'pharmacist';

  return {
  id: user.id,
  name: user.name,
  email: user.email,
    role,
    emailVerified,
    verificationStatus: emailVerified ? 'approved' : 'pending',
  createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
  };
};

const serializeBranch = (branch) => ({
  id: branch.id,
  name: branch.name,
  city: branch.city,
  address: branch.address,
  status: normalizeBranchStatus(branch.status),
  phoneNumber: branch.phoneNumber || null,
  email: branch.email || null,
  createdAt: branch.createdAt instanceof Date ? branch.createdAt.toISOString() : branch.createdAt,
  updatedAt: branch.updatedAt instanceof Date ? branch.updatedAt.toISOString() : branch.updatedAt,
});

const recordAuditLog = async ({ userId = null, action, entity, entityId = null, details = null }) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        details,
      },
    });
  } catch (error) {
    console.error('Failed to record audit log', error);
  }
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const shiftMonths = (date, months) => new Date(date.getFullYear(), date.getMonth() - months, 1);

const daysAgo = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  result.setHours(0, 0, 0, 0);
  return result;
};

const roundToTwo = (value) => Math.round((Number(value) || 0) * 100) / 100;

const sumOrderRevenue = (orders) => roundToTwo(orders.reduce((total, order) => total + (Number(order.totalAmount) || 0), 0));

const buildTrendBuckets = (orders, windowStart, bucketCount = 6) => {
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(windowStart);
    bucketStart.setDate(bucketStart.getDate() + index * 7);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketEnd.getDate() + 7);

    return {
      bucketStart,
      bucketEnd,
      revenue: 0,
      orders: 0,
    };
  });

  for (const order of orders) {
    const orderDate = new Date(order.createdAt);
    const diffDays = Math.floor((orderDate.getTime() - windowStart.getTime()) / MS_PER_DAY);
    if (diffDays < 0) continue;

    const bucketIndex = Math.min(bucketCount - 1, Math.floor(diffDays / 7));
    const bucket = buckets[bucketIndex];
    bucket.revenue += Number(order.totalAmount) || 0;
    bucket.orders += 1;
  }

  return buckets.map((bucket) => ({
    revenue: roundToTwo(bucket.revenue),
    orders: bucket.orders,
  }));
};

const formatStockItem = (item) => {
  const medicineName = item.medicine?.name || 'Unknown medicine';
  const branchLabel = item.branch ? `${item.branch.name}${item.branch.city ? `, ${item.branch.city}` : ''}` : 'Unknown branch';
  return `${medicineName} @ ${branchLabel} (${item.quantity})`;
};

const toPrismaRole = (role) => {
  const normalized = normalizeRole(role, '');
  if (!normalized) return null;
  if (normalized === 'admin') return 'ADMIN';
  if (normalized === 'pharmacist') return 'PHARMACIST';
  if (normalized === 'customer') return 'CUSTOMER';
  return null;
};

// Dashboard - System Overview
exports.getDashboard = async (req, res) => {
  try {
    const usersCount = await prisma.user.count();
    const customersCount = await prisma.user.count({ where: { role: 'CUSTOMER' } });
    const pharmacistsCount = await prisma.user.count({ where: { role: 'PHARMACIST' } });
    const branchesCount = await prisma.branch.count();

    const verifiedUsers = usersCount - pharmacistsCount;
    const unverifiedUsers = pharmacistsCount;

    const stats = {
      totalUsers: usersCount,
      totalCustomers: customersCount,
      totalPharmacists: pharmacistsCount,
      totalBranches: branchesCount,
      verifiedUsers,
      unverifiedUsers,
    };

    // Grab recent orders
    const recentOrders = await prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { customer: true }
    });

    const recentUsersRecord = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
         id: true,
         name: true,
         email: true,
         role: true,
         phone: true,
         createdAt: true,
      }
    });

    const recentBranchesRecord = await prisma.branch.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        status: true,
        phoneNumber: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({ 
      stats, 
      recentOrders,
      recentUsers: recentUsersRecord,
      recentBranches: recentBranchesRecord.map(serializeBranch),
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Users Management
exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    const userList = users.map(serializeUser);
    res.json({ users: userList, total: userList.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: serializeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, role } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) return res.status(404).json({ message: 'User not found' });

    const data = {};

    if (name) data.name = name;

    if (email && email !== existingUser.email) {
      const duplicate = await prisma.user.findUnique({ where: { email } });
      if (duplicate && duplicate.id !== userId) {
        return res.status(400).json({ message: 'Email already in use' });
      }
      data.email = email;
    }

    if (role) {
      const prismaRole = toPrismaRole(role);
      if (!prismaRole) return res.status(400).json({ message: 'Invalid role' });
      data.role = prismaRole;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    await recordAuditLog({
      userId: req.user?.id || null,
      action: 'User Updated',
      entity: 'User',
      entityId: updatedUser.id,
      details: Object.keys(data),
    });

    res.json({ ok: true, message: 'User updated', user: serializeUser(updatedUser) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) return res.status(404).json({ message: 'User not found' });
    await prisma.user.delete({ where: { id: userId } });

    await recordAuditLog({
      userId: req.user?.id || null,
      action: 'User Deleted',
      entity: 'User',
      entityId: userId,
      details: { email: existingUser.email, role: normalizeRole(existingUser.role) },
    });

    res.json({ ok: true, message: 'User deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createUser = async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing required fields' });
  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const prismaRole = toPrismaRole(role);
    if (!prismaRole) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        role: prismaRole,
        verificationStatus: prismaRole === 'PHARMACIST' ? 'PENDING' : 'APPROVED',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        verificationStatus: true,
        createdAt: true,
      },
    });

    await recordAuditLog({
      userId: req.user?.id || null,
      action: 'User Created',
      entity: 'User',
      entityId: user.id,
      details: { email, role: normalizeRole(role, 'customer') },
    });

    res.json({ ok: true, user: serializeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Pharmacists Management
exports.getPharmacists = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { role: 'PHARMACIST' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    const pharmacists = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    }));

    res.json({ pharmacists, total: pharmacists.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Branch Management
exports.getBranches = async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        status: true,
        phoneNumber: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const branchList = branches.map(serializeBranch);
    res.json({ branches: branchList, total: branchList.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.createBranch = async (req, res) => {
  try {
    const { name, city, address, phoneNumber, email, status } = req.body;
    if (!name || !city || !address) return res.status(400).json({ message: 'Missing required fields' });

    const branch = await prisma.branch.create({
      data: {
        name,
        city,
        address,
        phoneNumber: phoneNumber || null,
        email: email || null,
        status: normalizeBranchStatus(status, 'active'),
      },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        status: true,
        phoneNumber: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await recordAuditLog({
      userId: req.user?.id || null,
      action: 'Branch Created',
      entity: 'Branch',
      entityId: branch.id,
      details: { name, city, address },
    });

    res.status(201).json({ ok: true, branch: serializeBranch(branch) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateBranch = async (req, res) => {
  try {
    const { branchId } = req.params;
    const { name, city, address, phoneNumber, email, status } = req.body;

    const existingBranch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        status: true,
        phoneNumber: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!existingBranch) return res.status(404).json({ message: 'Branch not found' });

    const data = {};
    if (name) data.name = name;
    if (city) data.city = city;
    if (address) data.address = address;
    if (phoneNumber !== undefined) data.phoneNumber = phoneNumber || null;
    if (email !== undefined) data.email = email || null;
    if (status) data.status = normalizeBranchStatus(status, existingBranch.status);

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'No branch fields provided' });
    }

    const updatedBranch = await prisma.branch.update({
      where: { id: branchId },
      data,
      select: {
        id: true,
        name: true,
        city: true,
        address: true,
        status: true,
        phoneNumber: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await recordAuditLog({
      userId: req.user?.id || null,
      action: 'Branch Updated',
      entity: 'Branch',
      entityId: updatedBranch.id,
      details: Object.keys(data),
    });

    res.json({ ok: true, branch: serializeBranch(updatedBranch) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    const { branchId } = req.params;
    const existingBranch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!existingBranch) return res.status(404).json({ message: 'Branch not found' });

    await prisma.branch.delete({ where: { id: branchId } });

    await recordAuditLog({
      userId: req.user?.id || null,
      action: 'Branch Deleted',
      entity: 'Branch',
      entityId: branchId,
      details: { name: existingBranch.name, city: existingBranch.city },
    });

    res.json({ ok: true, message: 'Branch deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// System Configuration
exports.getSystemConfig = (req, res) => {
  const config = {
    taxRate: 18,
    minimumOrderValue: 200,
    paymentMethods: ['card', 'upi', 'wallet'],
    currencySymbol: '₹',
    businessName: 'Phoenixopia Pharmacy',
    businessEmail: 'support@phoenixopia.com',
  };
  res.json(config);
};

exports.updateSystemConfig = (req, res) => {
  const { taxRate, minimumOrderValue, paymentMethods } = req.body;
  const config = {
    taxRate: taxRate || 18,
    minimumOrderValue: minimumOrderValue || 200,
    paymentMethods: paymentMethods || ['card', 'upi', 'wallet'],
  };
  res.json({ ok: true, config });
};

// Reports
exports.getReports = async (req, res) => {
  try {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = shiftMonths(now, 1);
    const threeMonthsAgoStart = shiftMonths(now, 2);
    const ninetyDaysAgo = daysAgo(now, 90);

    const [
      allOrders,
      allUsers,
      recentOrders,
      recentPrescriptions,
      orderItems,
      lowStockInventory,
      outOfStockInventory,
      completedPayments,
    ] = await Promise.all([
      prisma.order.findMany({
        select: {
          totalAmount: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        select: {
          id: true,
          createdAt: true,
        },
      }),
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: ninetyDaysAgo,
          },
        },
        select: {
          customerId: true,
        },
      }),
      prisma.prescription.findMany({
        where: {
          uploadedAt: {
            gte: ninetyDaysAgo,
          },
        },
        select: {
          customerId: true,
        },
      }),
      prisma.orderItem.findMany({
        select: {
          quantity: true,
          price: true,
          medicine: {
            select: {
              name: true,
            },
          },
        },
      }),
      prisma.inventory.findMany({
        where: {
          quantity: {
            gt: 0,
            lte: 10,
          },
        },
        orderBy: [
          { quantity: 'asc' },
          { lastUpdated: 'desc' },
        ],
        take: 10,
        select: {
          quantity: true,
          medicine: {
            select: {
              name: true,
            },
          },
          branch: {
            select: {
              name: true,
              city: true,
            },
          },
        },
      }),
      prisma.inventory.findMany({
        where: {
          quantity: 0,
        },
        orderBy: { lastUpdated: 'desc' },
        take: 10,
        select: {
          quantity: true,
          medicine: {
            select: {
              name: true,
            },
          },
          branch: {
            select: {
              name: true,
              city: true,
            },
          },
        },
      }),
      prisma.payment.aggregate({
        where: {
          status: 'COMPLETED',
        },
        _count: {
          _all: true,
        },
      }),
    ]);

    const activeCustomerIds = new Set([
      ...recentOrders.map((order) => order.customerId),
      ...recentPrescriptions.map((prescription) => prescription.customerId),
    ]);

    const eligibleForChurn = allUsers.filter((user) => user.createdAt < ninetyDaysAgo);
    const inactiveEligibleUsers = eligibleForChurn.filter((user) => !activeCustomerIds.has(user.id));

    const topSellingMap = new Map();
    for (const item of orderItems) {
      const medicineName = item.medicine?.name || 'Unknown medicine';
      const existing = topSellingMap.get(medicineName) || { quantity: 0, revenue: 0 };
      existing.quantity += Number(item.quantity) || 0;
      existing.revenue += (Number(item.quantity) || 0) * (Number(item.price) || 0);
      topSellingMap.set(medicineName, existing);
    }

    const topSelling = [...topSellingMap.entries()]
      .sort((left, right) => right[1].quantity - left[1].quantity || right[1].revenue - left[1].revenue)
      .slice(0, 3)
      .map(([name, stats]) => `${name} - ${stats.quantity} sold`);

    const reports = {
      sales: {
        totalSales: sumOrderRevenue(allOrders),
        totalOrders: allOrders.length,
        avgOrderValue: allOrders.length ? roundToTwo(sumOrderRevenue(allOrders) / allOrders.length) : 0,
        completedPayments: completedPayments._count._all,
      },
      users: {
        newUsersThisMonth: allUsers.filter((user) => user.createdAt >= thisMonthStart).length,
        totalActiveUsers: activeCustomerIds.size,
        churnRate: eligibleForChurn.length ? roundToTwo((inactiveEligibleUsers.length / eligibleForChurn.length) * 100) : 0,
      },
      medicines: {
        topSelling: topSelling.length ? topSelling : ['No sales data yet'],
        lowStock: lowStockInventory.length ? lowStockInventory.map(formatStockItem) : ['No low stock items'],
        outOfStock: outOfStockInventory.length ? outOfStockInventory.map(formatStockItem) : ['No out of stock items'],
      },
    };

    res.json(reports);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Audit Logs
exports.getAuditLogs = async (req, res) => {
  try {
    const auditLogs = await prisma.auditLog.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    const logs = auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      by: log.user?.email || 'system',
      target: log.entityId || log.entity,
      timestamp: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
      entity: log.entity,
      details: log.details,
    }));

    res.json({ logs, total: logs.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Analytics
exports.getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const lastMonthStart = shiftMonths(now, 1);
    const threeMonthsAgoStart = shiftMonths(now, 2);
    const trendWindowStart = daysAgo(now, 42);

    const [ordersLastThreeMonths, usersLastThreeMonths] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: threeMonthsAgoStart,
            lte: now,
          },
        },
        select: {
          totalAmount: true,
          createdAt: true,
        },
      }),
      prisma.user.findMany({
        where: {
          createdAt: {
            gte: threeMonthsAgoStart,
            lte: now,
          },
        },
        select: {
          createdAt: true,
        },
      }),
    ]);

    const ordersLastMonth = ordersLastThreeMonths.filter((order) => order.createdAt >= lastMonthStart && order.createdAt < thisMonthStart);
    const ordersLastThreeMonthsTotal = sumOrderRevenue(ordersLastThreeMonths);
    const ordersLastMonthTotal = sumOrderRevenue(ordersLastMonth);
    const newUsersLastMonth = usersLastThreeMonths.filter((user) => user.createdAt >= lastMonthStart && user.createdAt < thisMonthStart).length;

    const analytics = {
      lastMonth: {
        revenue: ordersLastMonthTotal,
        orders: ordersLastMonth.length,
        newUsers: newUsersLastMonth,
      },
      last3Months: {
        revenue: ordersLastThreeMonthsTotal,
        orders: ordersLastThreeMonths.length,
        newUsers: usersLastThreeMonths.length,
      },
      trends: buildTrendBuckets(ordersLastThreeMonths, trendWindowStart),
    };

    res.json(analytics);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
