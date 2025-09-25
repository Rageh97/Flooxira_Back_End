const jwt = require('jsonwebtoken');
const { User } = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) {
      console.log('No token found in authorization header');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const payload = jwt.verify(token, JWT_SECRET);
    console.log('JWT payload:', payload);
    
    const user = await User.findByPk(payload.sub);
    if (!user) {
      console.log('User not found for ID:', payload.sub);
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    console.log('User found:', { id: user.id, name: user.name, email: user.email });
    req.user = user; // Set the full user object
    req.userId = user.id; // Keep for backward compatibility
    next();
  } catch (e) {
    console.error('Auth error:', e);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(payload.sub);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    req.userId = user.id;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

module.exports = { requireAuth, requireAdmin };








