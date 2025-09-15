const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

async function signUp(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ message: 'Email already in use' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role: 'user', isActive: true });
    const token = signToken(user);
    return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
  } catch (err) {
    console.error('signUp error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function signIn(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (!user.isActive) return res.status(403).json({ message: 'Account is deactivated' });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });
    const token = signToken(user);
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, token });
  } catch (err) {
    console.error('signIn error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function me(req, res) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(payload.sub);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

const pendingResets = new Map();

async function requestPasswordReset(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });
  const user = await User.findOne({ where: { email } });
  if (!user) return res.json({ ok: true });
  const token = Math.random().toString(36).slice(2, 10);
  pendingResets.set(email, token);
  return res.json({ ok: true, token });
}

async function resetPassword(req, res) {
  const { email, token, password } = req.body;
  if (!email || !token || !password) return res.status(400).json({ message: 'Missing fields' });
  const expected = pendingResets.get(email);
  if (!expected || expected !== token) return res.status(400).json({ message: 'Invalid token' });
  const user = await User.findOne({ where: { email } });
  if (!user) return res.status(400).json({ message: 'Invalid email' });
  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();
  pendingResets.delete(email);
  return res.json({ ok: true });
}

module.exports = { signUp, signIn, me, requestPasswordReset, resetPassword };


