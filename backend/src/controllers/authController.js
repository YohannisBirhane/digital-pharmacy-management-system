const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');

const env = process.env;
const JWT_SECRET = env.JWT_SECRET || 'change_this_secret';
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN || '7d';
const FRONTEND_URL = env.FRONTEND_URL || 'http://localhost:3000';
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const normalizeEnum = (value, fallback = null) => {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  return value.toLowerCase();
};

const serializeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: normalizeEnum(user.role, 'customer'),
  verificationStatus: normalizeEnum(
    user.verificationStatus,
    normalizeEnum(user.role, 'customer') === 'pharmacist' ? 'pending' : 'approved'
  ),
  emailVerified: Boolean(user.verifiedAt),
});

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
    const verificationToken = uuidv4();
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        phone: phone || null,
        role: 'PHARMACIST',
        verificationStatus: 'PENDING',
        pharmacyName,
        pharmacyLocation,
        licenseNumber,
        nationalId,
        verificationToken,
        verificationExpires,
      }
    });

    console.log(`Pharmacist verification token for ${email}: ${verificationToken}`);

    res.status(201).json({
      message: 'Pharmacist registration submitted for verification',
      user: serializeUser(user),
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

    if (normalizeEnum(user.role) === 'pharmacist' && normalizeEnum(user.verificationStatus, 'pending') !== 'approved') {
      return res.status(403).json({ message: 'Pharmacist account is pending verification' });
    }

    const serializedUser = serializeUser(user);
    const token = jwt.sign({ sub: user.id, role: serializedUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({
      user: serializedUser,
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
    res.json({ user: serializeUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.logout = (req, res) => {
  // stateless JWT - client should drop token
  res.json({ ok: true });
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Missing email' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ ok: true });

    const token = uuidv4();
    const resetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetExpires,
      },
    });

    console.log(`Password reset link: ${FRONTEND_URL}/reset-password?token=${token}`);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: 'Missing token or password' });

    const user = await prisma.user.findUnique({ where: { resetToken: token } });
    if (!user || !user.resetExpires || user.resetExpires <= new Date()) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetExpires: null,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Missing currentPassword or newPassword' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid current password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const token = req.body.token || req.query.token;
    if (!token) return res.status(400).json({ message: 'Missing token' });

    const user = await prisma.user.findUnique({ where: { verificationToken: token } });
    if (!user || !user.verificationExpires || user.verificationExpires <= new Date()) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verifiedAt: new Date(),
        verificationToken: null,
        verificationExpires: null,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const email = req.body.email || req.user?.email;
    if (!email) return res.status(400).json({ message: 'Missing email' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ ok: true });
    if (user.verifiedAt) return res.json({ ok: true });

    const token = uuidv4();
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: token,
        verificationExpires,
      },
    });

    console.log(`Verify email token for ${email}: ${token}`);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
