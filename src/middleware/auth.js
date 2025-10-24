const jwt = require('jsonwebtoken');
const { User } = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

async function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(payload.sub);
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    req.user = user; // Set the full user object
    req.userId = user.id; // Keep for backward compatibility
    next();
  } catch (e) {
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

async function requireEmployeeAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(token, JWT_SECRET);
    
    // Check if it's an employee
    if (payload.role === 'employee') {
      const { Employee } = require('../models/employee');
      const employee = await Employee.findByPk(payload.sub);
      if (!employee || !employee.isActive) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      req.employeeId = employee.id;
      req.ownerId = employee.ownerId;
      req.userId = employee.ownerId; // Set owner as the main user
      req.employee = employee;
    } else {
      // Regular user
      const user = await User.findByPk(payload.sub);
      if (!user) return res.status(401).json({ message: 'Unauthorized' });
      req.userId = user.id;
    }
    
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

module.exports = { requireAuth, requireAdmin, requireEmployeeAuth };








