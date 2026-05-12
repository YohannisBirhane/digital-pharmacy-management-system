const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const env = process.env;
const JWT_SECRET = env.JWT_SECRET || 'change_this_secret';
const JWT_EXPIRES_IN = env.JWT_EXPIRES_IN || '7d';
const RESET_EXPIRES_MIN = Number(env.RESET_TOKEN_EXPIRES_MIN || 60);
const VERIFICATION_EXPIRES_MIN = Number(env.VERIFICATION_TOKEN_EXPIRES_MIN || 1440);

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

function findByEmail(email) {
  const users = loadUsers();
  return users.find((u) => u.email === email);
}

exports.register = async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });
  if (findByEmail(email)) return res.status(400).json({ message: 'Email already exists' });
  const hashed = await bcrypt.hash(password, 10);
  const users = loadUsers();
  const verificationToken = uuidv4();
  const user = {
    id: uuidv4(),
    name,
    email,
    password: hashed,
    role: role || 'customer',
    emailVerified: false,
    verificationToken,
    verificationExpires: Date.now() + VERIFICATION_EXPIRES_MIN * 60 * 1000,
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  console.log(`Verify email link: http://localhost:${env.PORT || 5000}/auth/verify-email?token=${verificationToken}`);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified },
    token,
  });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing credentials' });
  const user = findByEmail(email);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: !!user.emailVerified },
    token,
  });
};

exports.me = (req, res) => {
  const users = loadUsers();
  const user = users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: !!user.emailVerified } });
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
