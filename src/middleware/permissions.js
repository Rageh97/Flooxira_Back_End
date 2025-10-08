const { UserSubscription } = require('../models/userSubscription');
const { Plan } = require('../models/plan');

/**
 * Middleware to check if user has active subscription
 */
const requireActiveSubscription = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Find active subscription
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
    const permissions = req.userPermissions;
    
    if (!permissions.platforms || !permissions.platforms.includes(platform)) {
      return res.status(403).json({
        success: false,
        message: `ليس لديك صلاحية الوصول إلى منصة ${platform}`,
        code: 'PLATFORM_ACCESS_DENIED'
      });
    }
    
    next();
  };
};

/**
 * Check if user can manage content
 */
const requireContentManagement = (req, res, next) => {
  const permissions = req.userPermissions;
  
  if (!permissions.canManageContent) {
    return res.status(403).json({
      success: false,
      message: 'ليس لديك صلاحية إدارة المحتوى',
      code: 'CONTENT_MANAGEMENT_DENIED'
    });
  }
  
  next();
};

/**
 * Check if user can manage WhatsApp
 */
const requireWhatsAppManagement = (req, res, next) => {
  const permissions = req.userPermissions;
  
  if (!permissions.canManageWhatsApp) {
    return res.status(403).json({
      success: false,
      message: 'ليس لديك صلاحية إدارة الواتساب',
      code: 'WHATSAPP_MANAGEMENT_DENIED'
    });
  }
  
  next();
};

/**
 * Check if user can manage Telegram
 */
const requireTelegramManagement = (req, res, next) => {
  const permissions = req.userPermissions;
  
  if (!permissions.canManageTelegram) {
    return res.status(403).json({
      success: false,
      message: 'ليس لديك صلاحية إدارة التليجرام',
      code: 'TELEGRAM_MANAGEMENT_DENIED'
    });
  }
  
  next();
};

/**
 * Check if user can use Salla integration
 */
const requireSallaIntegration = (req, res, next) => {
  const permissions = req.userPermissions;
  
  if (!permissions.canSallaIntegration) {
    return res.status(403).json({
      success: false,
      message: 'ليس لديك صلاحية تكامل سلة',
      code: 'SALLA_INTEGRATION_DENIED'
    });
  }
  
  next();
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

    // TODO: Implement actual post count check for limited plans
    // For now, we'll just pass through
    // In the future, you can add a Post model and count posts for current month
    
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
 * Get user subscription info
 */
const getUserSubscriptionInfo = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
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

module.exports = {
  requireActiveSubscription,
  requirePlatformAccess,
  requireContentManagement,
  requireWhatsAppManagement,
  requireTelegramManagement,
  requireSallaIntegration,
  checkMonthlyPostsLimit,
  checkWhatsAppMessagesLimit,
  getUserSubscriptionInfo
};
