const { UserSubscription, Plan } = require('../models');

/**
 * Middleware to check if user has active subscription
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    const userId = req.userId || req.user?.id;
    
    // إذا كان موظف، يتحقق من اشتراك المالك
    if (req.employeeId) {
      const ownerId = req.ownerId;
      const subscription = await UserSubscription.findOne({
        where: {
          userId: ownerId,
          status: 'active',
          expiresAt: {
            [require('sequelize').Op.gt]: new Date() // expiresAt > now
          }
        },
        include: [
          {
            model: Plan,
            as: 'plan',
            attributes: ['id', 'name', 'permissions']
          }
        ]
      });

      if (!subscription) {
        return res.status(403).json({
          success: false,
          message: 'ليس لديك اشتراك نشط',
          code: 'NO_ACTIVE_SUBSCRIPTION'
        });
      }

      // إضافة بيانات الاشتراك للطلب
      req.userSubscription = subscription;
      req.userPermissions = subscription.plan.permissions;
      
      // إضافة صلاحيات الموظف أيضاً
      if (req.employee) {
        req.employeePermissions = req.employee.permissions;
      }
      
      return next();
    }
    
    // للمالك العادي، يتحقق من اشتراكه
    const subscription = await UserSubscription.findOne({
      where: {
        userId: userId,
        status: 'active',
        expiresAt: {
          [require('sequelize').Op.gt]: new Date() // expiresAt > now
        }
      },
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'permissions']
        }
      ]
    });

    if (!subscription) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك اشتراك نشط. يرجى الاشتراك أولاً.',
        code: 'NO_ACTIVE_SUBSCRIPTION'
      });
    }

    // Add subscription info to request
    req.subscription = subscription;
    req.userPermissions = subscription.plan.permissions || {};
    
    next();
  } catch (error) {
    console.error('Permission check error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في التحقق من الصلاحيات'
    });
  }
};

/**
 * Check if user can access specific platform
 */
const requirePlatformAccess = (platform) => {
  return (req, res, next) => {
    // إذا كان موظف، يتحقق من صلاحيات الموظف
    if (req.employee) {
      const permissions = req.employee.permissions;
      if (!permissions.platforms || !permissions.platforms.includes(platform)) {
        return res.status(403).json({
          success: false,
          message: `ليس لديك صلاحية الوصول إلى منصة ${platform}`,
          code: 'PLATFORM_ACCESS_DENIED'
        });
      }
    } else {
      // للمالك العادي، يتحقق من صلاحيات الاشتراك
      const permissions = req.userPermissions;
      if (!permissions.platforms || !permissions.platforms.includes(platform)) {
        return res.status(403).json({
          success: false,
          message: `ليس لديك صلاحية الوصول إلى منصة ${platform}`,
          code: 'PLATFORM_ACCESS_DENIED'
        });
      }
    }
    
    next();
  };
};

/**
 * Check if user can manage content
 */
const requireContentManagement = (req, res, next) => {
  // إذا كان موظف، يتحقق من صلاحيات الموظف
  if (req.employee) {
    const permissions = req.employee.permissions;
    if (!permissions.canManageContent) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة المحتوى',
        code: 'CONTENT_MANAGEMENT_DENIED'
      });
    }
  } else {
    // للمالك العادي، يتحقق من صلاحيات الاشتراك
    const permissions = req.userPermissions;
    if (!permissions.canManageContent) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة المحتوى',
        code: 'CONTENT_MANAGEMENT_DENIED'
      });
    }
  }
  
  next();
};

/**
 * Check if user can manage WhatsApp
 */
const requireWhatsAppManagement = (req, res, next) => {
  // إذا كان موظف، يتحقق من صلاحيات الموظف
  if (req.employeeId) {
    const permissions = req.employee?.permissions || req.employeePermissions;
    if (!permissions || !permissions.canManageWhatsApp) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة الواتساب',
        code: 'WHATSAPP_MANAGEMENT_DENIED'
      });
    }
  } else {
    // للمالك العادي، يتحقق من صلاحيات الاشتراك
    const permissions = req.userPermissions;
    if (!permissions || !permissions.canManageWhatsApp) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة الواتساب',
        code: 'WHATSAPP_MANAGEMENT_DENIED'
      });
    }
  }
  
  next();
};

/**
 * Check if user can manage Telegram
 */
const requireTelegramManagement = (req, res, next) => {
  // إذا كان موظف، يتحقق من صلاحيات الموظف
  if (req.employeeId) {
    const permissions = req.employee?.permissions || req.employeePermissions;
    if (!permissions || !permissions.canManageTelegram) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة التليجرام',
        code: 'TELEGRAM_MANAGEMENT_DENIED'
      });
    }
  } else {
    // للمالك العادي، يتحقق من صلاحيات الاشتراك
    const permissions = req.userPermissions;
    if (!permissions || !permissions.canManageTelegram) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة التليجرام',
        code: 'TELEGRAM_MANAGEMENT_DENIED'
      });
    }
  }
  
  next();
};

/**
 * Check if user can use Salla integration
 */
const requireSallaIntegration = (req, res, next) => {
  // إذا كان موظف، يتحقق من صلاحيات الموظف
  if (req.employeeId) {
    const permissions = req.employee?.permissions || req.employeePermissions;
    if (!permissions || !permissions.canSallaIntegration) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية تكامل سلة',
        code: 'SALLA_INTEGRATION_DENIED'
      });
    }
  } else {
    // للمالك العادي، يتحقق من صلاحيات الاشتراك
    const permissions = req.userPermissions;
    if (!permissions || !permissions.canSallaIntegration) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية تكامل سلة',
        code: 'SALLA_INTEGRATION_DENIED'
      });
    }
  }
  
  next();
};

/**
 * Check if user can manage customers
 */
const requireCustomerManagement = (req, res, next) => {
  // إذا كان موظف، يتحقق من صلاحيات الموظف
  if (req.employeeId) {
    const permissions = req.employee?.permissions || req.employeePermissions;
    if (!permissions || !permissions.canManageCustomers) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة العملاء',
        code: 'CUSTOMER_MANAGEMENT_DENIED'
      });
    }
  } else {
    // للمالك العادي، يتحقق من صلاحيات الاشتراك
    const permissions = req.userPermissions;
    if (!permissions || !permissions.canManageCustomers) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إدارة العملاء',
        code: 'CUSTOMER_MANAGEMENT_DENIED'
      });
    }
  }
  
  next();
};

/**
 * Generic feature access checker
 */
const requireFeatureAccess = (feature) => {
  return (req, res, next) => {
    // إذا كان موظف، يتحقق من صلاحيات الموظف
    if (req.employeeId) {
      const permissions = req.employee?.permissions || req.employeePermissions;
      if (!permissions || !permissions[feature]) {
        return res.status(403).json({
          success: false,
          message: `ليس لديك صلاحية الوصول إلى ميزة ${feature}`,
          code: 'FEATURE_ACCESS_DENIED'
        });
      }
    } else {
      // للمالك العادي، يتحقق من صلاحيات الاشتراك
      const permissions = req.userPermissions;
      if (!permissions || !permissions[feature]) {
        return res.status(403).json({
          success: false,
          message: `ليس لديك صلاحية الوصول إلى ميزة ${feature}`,
          code: 'FEATURE_ACCESS_DENIED'
        });
      }
    }
    
    next();
  };
};

/**
 * Check monthly posts limit
 */
const checkMonthlyPostsLimit = async (req, res, next) => {
  try {
    const permissions = req.userPermissions;
    const monthlyLimit = permissions.monthlyPosts || 0;
    
    if (monthlyLimit === 0) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية نشر المنشورات',
        code: 'POSTS_DENIED'
      });
    }

    // If unlimited (-1), allow all posts
    if (monthlyLimit === -1) {
      return next();
    }

    // Check if user can create posts for the requested platforms
    const limitService = require('../services/limitService');
    const platforms = req.body.platforms || ['facebook']; // Default to Facebook if not specified
    
    for (const platform of platforms) {
      const canCreate = await limitService.canCreatePost(req.userId, platform);
      if (!canCreate.canCreate) {
        return res.status(403).json({
          success: false,
          message: canCreate.reason,
          code: 'POSTS_LIMIT_EXCEEDED'
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Posts limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في التحقق من حد المنشورات'
    });
  }
};

/**
 * Check WhatsApp messages limit
 */
const checkWhatsAppMessagesLimit = async (req, res, next) => {
  try {
    const permissions = req.userPermissions;
    const monthlyLimit = permissions.whatsappMessagesPerMonth || 0;
    
    if (monthlyLimit === 0) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية إرسال رسائل واتساب',
        code: 'WHATSAPP_MESSAGES_DENIED'
      });
    }

    // If unlimited (-1), allow all messages
    if (monthlyLimit === -1) {
      return next();
    }

    // TODO: Implement actual WhatsApp messages count check for current month
    
    next();
  } catch (error) {
    console.error('WhatsApp messages limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'خطأ في التحقق من حد رسائل الواتساب'
    });
  }
};

/**
 * Check if user is admin
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.',
      code: 'ADMIN_ACCESS_DENIED'
    });
  }
  next();
};

/**
 * Get user subscription info
 */
const getUserSubscriptionInfo = async (req, res, next) => {
  try {
    const userId = req.userId || req.user?.id;
    
    const subscription = await UserSubscription.findOne({
      where: {
        userId: userId,
        status: 'active',
        expiresAt: {
          [require('sequelize').Op.gt]: new Date()
        }
      },
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'permissions']
        }
      ]
    });

    req.subscription = subscription;
    req.userPermissions = subscription?.plan?.permissions || {};
    
    next();
  } catch (error) {
    console.error('Get subscription info error:', error);
    req.subscription = null;
    req.userPermissions = {};
    next();
  }
};

/**
 * Check if user can manage employees
 */
const requireEmployeeManagement = (req, res, next) => {
  const userPermissions = req.userPermissions || {};
  
  if (!userPermissions.canManageEmployees) {
    return res.status(403).json({
      success: false,
      message: 'ليس لديك صلاحية إدارة الموظفين',
      code: 'EMPLOYEE_MANAGEMENT_DENIED'
    });
  }
  
  next();
};

/**
 * Check if employee has specific permission
 */
const requireEmployeePermission = (permission) => {
  return (req, res, next) => {
    const employee = req.employee;
    
    if (!employee) {
      return res.status(403).json({
        success: false,
        message: 'ليس لديك صلاحية للوصول إلى هذه الميزة',
        code: 'EMPLOYEE_PERMISSION_DENIED'
      });
    }
    
    const employeePermissions = employee.permissions || {};
    
    if (!employeePermissions[permission]) {
      return res.status(403).json({
        success: false,
        message: `ليس لديك صلاحية ${permission}`,
        code: 'EMPLOYEE_PERMISSION_DENIED'
      });
    }
    
    next();
  };
};

module.exports = {
  requireActiveSubscription,
  requirePlatformAccess,
  requireEmployeeManagement,
  requireEmployeePermission,
  requireContentManagement,
  requireWhatsAppManagement,
  requireTelegramManagement,
  requireSallaIntegration,
  requireCustomerManagement,
  requireFeatureAccess,
  checkMonthlyPostsLimit,
  checkWhatsAppMessagesLimit,
  requireAdmin,
  getUserSubscriptionInfo
};
