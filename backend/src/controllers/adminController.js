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
exports.getReports = (req, res) => {
  const reports = {
    sales: {
      totalSales: 500000,
      totalOrders: 1200,
      avgOrderValue: 416.67,
    },
    users: {
      newUsersThisMonth: 150,
      totalActiveUsers: 3500,
      churnRate: 5,
    },
    medicines: {
      topSelling: ['Aspirin', 'Crocin', 'Dolo 650'],
      lowStock: ['Medicine A', 'Medicine B'],
      outOfStock: ['Medicine C'],
    },
  };
  res.json(reports);
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
exports.getAnalytics = (req, res) => {
  const analytics = {
    lastMonth: {
      revenue: 450000,
      orders: 1100,
      newUsers: 120,
    },
    last3Months: {
      revenue: 1350000,
      orders: 3200,
      newUsers: 350,
    },
    trends: {
      revenue: [100000, 120000, 130000, 100000, 110000, 115000],
      orders: [700, 750, 800, 700, 750, 800],
    },
  };
  res.json(analytics);
};
