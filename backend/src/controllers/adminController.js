const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '..', 'data', 'users.json');

function loadUsers() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function saveUsers(users) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// Dashboard - System Overview
exports.getDashboard = (req, res) => {
  const users = loadUsers();
  const stats = {
    totalUsers: users.length,
    totalCustomers: users.filter((u) => u.role === 'customer').length,
    totalPharmacists: users.filter((u) => u.role === 'pharmacist').length,
    totalDeliveryStaff: users.filter((u) => u.role === 'delivery').length,
    verifiedUsers: users.filter((u) => u.emailVerified).length,
    unverifiedUsers: users.filter((u) => !u.emailVerified).length,
  };
  res.json({ stats, timestamp: new Date().toISOString() });
};

// Users Management
exports.getAllUsers = (req, res) => {
  const users = loadUsers();
  const userList = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
  }));
  res.json({ users: userList, total: userList.length });
};

exports.getUser = (req, res) => {
  const { userId } = req.params;
  const users = loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
  });
};

exports.updateUser = (req, res) => {
  const { userId } = req.params;
  const { name, email, role } = req.body;
  const users = loadUsers();
  const user = users.find((u) => u.id === userId);
  if (!user) return res.status(404).json({ message: 'User not found' });

  if (name) user.name = name;
  if (email && email !== user.email) {
    if (users.some((u) => u.email === email && u.id !== userId)) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    user.email = email;
  }
  if (role && ['customer', 'pharmacist', 'delivery', 'admin'].includes(role)) {
    user.role = role;
  }
  saveUsers(users);
  res.json({ ok: true, message: 'User updated' });
};

exports.deleteUser = (req, res) => {
  const { userId } = req.params;
  const users = loadUsers();
  const index = users.findIndex((u) => u.id === userId);
  if (index === -1) return res.status(404).json({ message: 'User not found' });
  users.splice(index, 1);
  saveUsers(users);
  res.json({ ok: true, message: 'User deleted' });
};

exports.createUser = (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing required fields' });
  const users = loadUsers();
  if (users.some((u) => u.email === email)) {
    return res.status(400).json({ message: 'Email already exists' });
  }
  const bcrypt = require('bcryptjs');
  const hashed = bcrypt.hashSync(password, 10);
  const user = {
    id: uuidv4(),
    name,
    email,
    password: hashed,
    role: role || 'customer',
    emailVerified: false,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
};

// Pharmacists Management
exports.getPharmacists = (req, res) => {
  const users = loadUsers();
  const pharmacists = users
    .filter((u) => u.role === 'pharmacist')
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
    }));
  res.json({ pharmacists, total: pharmacists.length });
};

// Delivery Staff Management
exports.getDeliveryStaff = (req, res) => {
  const users = loadUsers();
  const deliveryStaff = users
    .filter((u) => u.role === 'delivery')
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
    }));
  res.json({ deliveryStaff, total: deliveryStaff.length });
};

// Branch Management
exports.getBranches = (req, res) => {
  const branches = [
    { id: '1', name: 'Main Branch', city: 'Mumbai', address: '123 Main St', status: 'active' },
    { id: '2', name: 'West Branch', city: 'Pune', address: '456 West Ave', status: 'active' },
  ];
  res.json({ branches, total: branches.length });
};

exports.createBranch = (req, res) => {
  const { name, city, address } = req.body;
  if (!name || !city || !address) return res.status(400).json({ message: 'Missing required fields' });
  const branch = {
    id: uuidv4(),
    name,
    city,
    address,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  res.json({ ok: true, branch });
};

// System Configuration
exports.getSystemConfig = (req, res) => {
  const config = {
    taxRate: 18,
    deliveryCharge: 50,
    minimumOrderValue: 200,
    paymentMethods: ['card', 'upi', 'wallet'],
    currencySymbol: '₹',
    businessName: 'Phoenixopia Pharmacy',
    businessEmail: 'support@phoenixopia.com',
  };
  res.json(config);
};

exports.updateSystemConfig = (req, res) => {
  const { taxRate, deliveryCharge, minimumOrderValue, paymentMethods } = req.body;
  const config = {
    taxRate: taxRate || 18,
    deliveryCharge: deliveryCharge || 50,
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
    delivery: {
      onTimeDelivery: 98.5,
      avgDeliveryTime: 2.3,
      deliverySuccess: 99.2,
    },
  };
  res.json(reports);
};

// Audit Logs
exports.getAuditLogs = (req, res) => {
  const logs = [
    { id: '1', action: 'User Created', by: 'admin@example.com', target: 'user-123', timestamp: new Date().toISOString() },
    { id: '2', action: 'User Deleted', by: 'admin@example.com', target: 'user-456', timestamp: new Date(Date.now() - 3600000).toISOString() },
    { id: '3', action: 'Config Updated', by: 'admin@example.com', target: 'system', timestamp: new Date(Date.now() - 7200000).toISOString() },
  ];
  res.json({ logs, total: logs.length });
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
