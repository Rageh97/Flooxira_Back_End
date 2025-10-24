const express = require('express');
const router = express.Router();
const { requireAuth, requireEmployeeAuth } = require('../middleware/auth');
const { requireActiveSubscription, requireEmployeeManagement } = require('../middleware/permissions');
const {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  employeeLogin,
  changeEmployeePassword,
  getEmployeeStats
} = require('../controllers/employee.controller');

// تسجيل دخول الموظف (لا يحتاج مصادقة)
router.post('/login', employeeLogin);

// مسار للموظف للحصول على بياناته (يحتاج مصادقة موظف)
router.get('/me', requireEmployeeAuth, async (req, res) => {
  try {
    const employee = req.employee;
    res.json({
      success: true,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        permissions: employee.permissions,
        isActive: employee.isActive,
        lastLoginAt: employee.lastLoginAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'خطأ في جلب بيانات الموظف'
    });
  }
});

// جميع المسارات الأخرى تحتاج مصادقة مالك
router.use(requireAuth);
router.use(requireActiveSubscription);
router.use(requireEmployeeManagement);

// إدارة الموظفين
router.post('/', createEmployee);
router.get('/', getEmployees);
router.get('/stats', getEmployeeStats);
router.get('/:id', getEmployee);
router.put('/:id', updateEmployee);
router.delete('/:id', deleteEmployee);
router.put('/:id/password', changeEmployeePassword);

module.exports = router;
