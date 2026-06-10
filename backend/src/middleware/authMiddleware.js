const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const env = process.env;
const JWT_SECRET = env.JWT_SECRET || 'change_this_secret';

async function verifyToken(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
    if (!user) return res.status(401).json({ message: 'Invalid token user' });
    const normalizedRole = String(user.role || '').toLowerCase();
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: normalizedRole,
      verificationStatus: normalizedRole === 'pharmacist' ? 'pending' : 'approved',
    };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    const normalizedAllowed = allowed.map((role) => String(role).toLowerCase());
    if (!normalizedAllowed.includes(String(req.user.role).toLowerCase())) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

module.exports = { verifyToken, requireRole };
