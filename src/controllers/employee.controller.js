const { Employee } = require('../models/employee');
const { User } = require('../models/user');
const { UserSubscription } = require('../models/userSubscription');
const { Plan } = require('../models/plan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

/**
 * إنشاء موظف جديد
 */
async function createEmployee(req, res) {
  try {
    const { email, name, phone, password, permissions } = req.body;
    const ownerId = req.userId;

    // التحقق من وجود الموظف مسبقاً
    const existingEmployee = await Employee.findOne({
      where: { email }
    });

    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مستخدم بالفعل'
      });
    }

    // التحقق من صلاحيات المالك
    const ownerSubscription = await UserSubscription.findOne({
      where: {
        userId: ownerId,
        status: 'active',
        expiresAt: { [Op.gt]: new Date() }
      },
      include: [{ model: Plan, as: 'plan' }]
    });

    if (!ownerSubscription) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك اشتراك نشط'
      });
    }

    const ownerPermissions = ownerSubscription.plan.permissions || {};
    
    if (!ownerPermissions.canManageEmployees) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة الموظفين'
      });
    }

    // التحقق من الحد الأقصى للموظفين
    if (ownerPermissions.maxEmployees > 0) {
      const currentEmployeeCount = await Employee.count({
        where: { ownerId, isActive: true }
      });

      if (currentEmployeeCount >= ownerPermissions.maxEmployees) {
        return res.status(400).json({
          success: false,
          message: `لقد وصلت للحد الأقصى من الموظفين (${ownerPermissions.maxEmployees})`
        });
      }
    }

    // إنشاء الموظف (سيتم تشفير كلمة المرور في الـ model hook)
    const employee = await Employee.create({
      email,
      name,
      phone,
      passwordHash: password, // سيتم hash في الـ beforeCreate hook
      ownerId,
      permissions: permissions || {}
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الموظف بنجاح',
      employee: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        phone: employee.phone,
        permissions: employee.permissions,
        isActive: employee.isActive,
        createdAt: employee.createdAt
      }
    });

  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في إنشاء الموظف'
    });
  }
}

/**
 * جلب جميع موظفي المستخدم
 */
async function getEmployees(req, res) {
  try {
    const ownerId = req.userId;
    const { page = 1, limit = 10, search = '' } = req.query;

    const offset = (page - 1) * limit;

    // بناء شروط البحث
    const whereClause = {
      ownerId,
      isActive: true
    };

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: employees } = await Employee.findAndCountAll({
      where: whereClause,
      attributes: [
        'id', 'email', 'name', 'phone', 'permissions', 
        'isActive', 'lastLoginAt', 'createdAt'
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      employees,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في جلب الموظفين'
    });
  }
}

/**
 * جلب موظف واحد
 */
async function getEmployee(req, res) {
  try {
    const { id } = req.params;
    const ownerId = req.userId;

    const employee = await Employee.findOne({
      where: { id, ownerId },
      attributes: [
        'id', 'email', 'name', 'phone', 'permissions', 
        'isActive', 'lastLoginAt', 'createdAt'
      ]
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    res.json({
      success: true,
      employee
    });

  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في جلب الموظف'
    });
  }
}

/**
 * تحديث موظف
 */
async function updateEmployee(req, res) {
  try {
    const { id } = req.params;
    const { name, phone, permissions } = req.body;
    const ownerId = req.userId;

    const employee = await Employee.findOne({
      where: { id, ownerId }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // تحديث البيانات
    await employee.update({
      name: name || employee.name,
      phone: phone || employee.phone,
      permissions: permissions || employee.permissions
    });

    res.json({
      success: true,
      message: 'تم تحديث الموظف بنجاح',
      employee: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        phone: employee.phone,
        permissions: employee.permissions,
        isActive: employee.isActive
      }
    });

  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في تحديث الموظف'
    });
  }
}

/**
 * حذف موظف (تعطيل)
 */
async function deleteEmployee(req, res) {
  try {
    const { id } = req.params;
    const ownerId = req.userId;

    const employee = await Employee.findOne({
      where: { id, ownerId }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // تعطيل الموظف بدلاً من الحذف
    await employee.update({ isActive: false });

    res.json({
      success: true,
      message: 'تم حذف الموظف بنجاح'
    });

  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في حذف الموظف'
    });
  }
}

/**
 * تسجيل دخول الموظف
 */
async function employeeLogin(req, res) {
  try {
    const { email, password } = req.body;

    const employee = await Employee.findOne({
      where: { email, isActive: true },
      include: [{ model: User, as: 'owner' }]
    });

    if (!employee) {
      return res.status(401).json({
        success: false,
        message: 'بيانات الدخول غير صحيحة'
      });
    }

    // التحقق من كلمة المرور
    const isValidPassword = await employee.validPassword(password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'بيانات الدخول غير صحيحة'
      });
    }

    // تحديث آخر دخول
    await employee.update({ lastLoginAt: new Date() });

    // إنشاء JWT token
    const token = jwt.sign(
      { 
        sub: employee.id, 
        email: employee.email,
        role: 'employee',
        ownerId: employee.ownerId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'تم تسجيل الدخول بنجاح',
      token,
      employee: {
        id: employee.id,
        email: employee.email,
        name: employee.name,
        permissions: employee.permissions,
        owner: {
          id: employee.owner.id,
          name: employee.owner.name,
          email: employee.owner.email
        }
      }
    });

  } catch (error) {
    console.error('Employee login error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في تسجيل الدخول'
    });
  }
}

/**
 * تغيير كلمة مرور الموظف
 */
async function changeEmployeePassword(req, res) {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    const ownerId = req.userId;

    const employee = await Employee.findOne({
      where: { id, ownerId }
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'الموظف غير موجود'
      });
    }

    // تشفير كلمة المرور الجديدة
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await employee.update({ passwordHash });

    res.json({
      success: true,
      message: 'تم تغيير كلمة المرور بنجاح'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في تغيير كلمة المرور'
    });
  }
}

/**
 * إحصائيات الموظفين
 */
async function getEmployeeStats(req, res) {
  try {
    const ownerId = req.userId;

    const totalEmployees = await Employee.count({
      where: { ownerId, isActive: true }
    });

    const activeEmployees = await Employee.count({
      where: { 
        ownerId, 
        isActive: true,
        lastLoginAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // آخر 7 أيام
      }
    });

    res.json({
      success: true,
      stats: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees: totalEmployees - activeEmployees
      }
    });

  } catch (error) {
    console.error('Get employee stats error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في جلب إحصائيات الموظفين'
    });
  }
}

module.exports = {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  employeeLogin,
  changeEmployeePassword,
  getEmployeeStats
};
