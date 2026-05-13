const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');

const env = process.env;
const JWT_SECRET = env.JWT_SECRET || 'change_this_secret';
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN || '7d';

exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, pharmacyName, pharmacyLocation, licenseNumber, nationalId } = req.body;
    if (!name || !email || !password || !phone || !pharmacyName || !pharmacyLocation || !licenseNumber || !nationalId) {
      return res.status(400).json({
        message: 'Missing required fields for pharmacist registration',
      });
    }
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ message: 'Email already exists' });

    const existingLicense = await prisma.user.findUnique({ where: { licenseNumber } });
    if (existingLicense) return res.status(400).json({ message: 'License number already exists' });

    const existingNationalId = await prisma.user.findUnique({ where: { nationalId } });
    if (existingNationalId) return res.status(400).json({ message: 'National ID already exists' });
    
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        phone: phone || null,
        role: 'PHARMACIST',
        pharmacyName,
        pharmacyLocation,
        licenseNumber,
        nationalId,
        verificationStatus: 'PENDING',
      }
    });

    res.status(201).json({
      message: 'Pharmacist registration submitted for verification',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.toLowerCase(),
        verificationStatus: user.verificationStatus.toLowerCase(),
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Missing credentials' });
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    if (user.role === 'PHARMACIST' && user.verificationStatus !== 'APPROVED') {
      return res.status(403).json({ message: 'Pharmacist account is pending verification' });
    }
    
    const token = jwt.sign({ sub: user.id, role: user.role.toLowerCase() }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role.toLowerCase(), verificationStatus: user.verificationStatus.toLowerCase() },
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role.toLowerCase() } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.logout = (req, res) => {
  // stateless JWT - client should drop token
  res.json({ ok: true });
};

exports.requestPasswordReset = (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Missing email' });
  const users = loadUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return res.json({ ok: true });
  const token = uuidv4();
  user.resetToken = token;
  user.resetExpires = Date.now() + RESET_EXPIRES_MIN * 60 * 1000;
  saveUsers(users);
  // For demo: print reset link to console (in real app email it)
  console.log(`Password reset link: http://localhost:${env.PORT || 5000}/auth/reset?token=${token}`);
  res.json({ ok: true });
};

exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ message: 'Missing token or password' });
  const users = loadUsers();
  const user = users.find((u) => u.resetToken === token && u.resetExpires && u.resetExpires > Date.now());
  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
  user.password = await bcrypt.hash(password, 10);
  delete user.resetToken;
  delete user.resetExpires;
  saveUsers(users);
  res.json({ ok: true });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Missing currentPassword or newPassword' });
  const users = loadUsers();
  const user = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return res.status(401).json({ message: 'Invalid current password' });
  user.password = await bcrypt.hash(newPassword, 10);
  saveUsers(users);
  res.json({ ok: true });
};

exports.verifyEmail = (req, res) => {
  const token = req.body.token || req.query.token;
  if (!token) return res.status(400).json({ message: 'Missing token' });
  const users = loadUsers();
  const user = users.find((u) => u.verificationToken === token && u.verificationExpires && u.verificationExpires > Date.now());
  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });
  user.emailVerified = true;
  delete user.verificationToken;
  delete user.verificationExpires;
  saveUsers(users);
  res.json({ ok: true });
};

exports.resendVerification = (req, res) => {
  const email = req.body.email || req.user?.email;
  if (!email) return res.status(400).json({ message: 'Missing email' });
  const users = loadUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return res.json({ ok: true });
  if (user.emailVerified) return res.json({ ok: true });
  const token = uuidv4();
  user.verificationToken = token;
  user.verificationExpires = Date.now() + VERIFICATION_EXPIRES_MIN * 60 * 1000;
  saveUsers(users);
  console.log(`Verify email link: http://localhost:${env.PORT || 5000}/auth/verify-email?token=${token}`);
  res.json({ ok: true });
};
