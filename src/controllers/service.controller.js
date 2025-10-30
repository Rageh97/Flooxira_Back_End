const { Service } = require('../models/service');
const { User } = require('../models/user');
const { UserSubscription } = require('../models/userSubscription');
const { Plan } = require('../models/plan');
const { Op } = require('sequelize');

// Create a new service
async function createService(req, res) {
  try {
    // req.userId يتم ضبطه بواسطة requireEmployeeAuth
    // إذا كان موظف، req.userId = ownerId
    // إذا كان مالك، req.userId = user.id
    const userId = req.userId;
    const { title, description, price, currency, purchaseLink, category, tags, isActive } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'العنوان مطلوب' });
    }

    // الـ middleware بالفعل تحقق من الاشتراك والصلاحيات
    // فقط نحتاج للتحقق من حد الخدمات
    const permissions = req.userPermissions;
    const maxServices = permissions.maxServices || 0;
    const currentServicesCount = await Service.count({
      where: { userId: userId }
    });

    if (maxServices > 0 && currentServicesCount >= maxServices) {
      return res.status(403).json({ 
        message: `لقد وصلت إلى الحد الأقصى من الخدمات (${maxServices}). يرجى ترقية باقتك أو حذف خدمة موجودة.` 
      });
    }

    // Handle image upload if provided
    let imagePath = null;
    if (req.file) {
      // Save relative path from uploads directory
      imagePath = `services/${req.file.filename}`;
    }

    const service = await Service.create({
      userId: userId,
      title: title,
      description: description || null,
      price: parseFloat(price) || 0,
      currency: currency || 'SAR',
      purchaseLink: purchaseLink || null,
      image: imagePath,
      category: category || null,
      tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : null,
      isActive: isActive !== undefined ? isActive : true,
      approvalStatus: 'pending' // All new services need approval
    });

    return res.status(201).json({ 
      success: true, 
      service,
      message: 'تم إنشاء الخدمة بنجاح' 
    });
  } catch (error) {
    console.error('Create service error:', error);
    return res.status(500).json({ message: 'فشل في إنشاء الخدمة' });
  }
}

// Get user's services
async function getUserServices(req, res) {
  try {
    const userId = req.userId;

    const services = await Service.findAll({
      where: { userId: userId },
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }]
    });

    // Get user's max services limit
    const activeSubscription = await UserSubscription.findOne({
      where: {
        userId: userId,
        status: 'active',
        expiresAt: {
          [Op.gt]: new Date()
        }
      },
      include: [{
        model: Plan,
        as: 'plan'
      }],
      order: [['expiresAt', 'DESC']]
    });

    const permissions = activeSubscription?.plan?.permissions || {};
    const maxServices = permissions.maxServices || 0;
    const canMarketServices = permissions.canMarketServices || false;

    return res.json({ 
      success: true, 
      services,
      stats: {
        currentCount: services.length,
        maxServices: maxServices,
        canMarketServices: canMarketServices,
        canCreateMore: maxServices === 0 || services.length < maxServices
      }
    });
  } catch (error) {
    console.error('Get user services error:', error);
    return res.status(500).json({ message: 'فشل في جلب الخدمات' });
  }
}

// Get all active services for public display
async function getAllActiveServices(req, res) {
  try {
    const { page = 1, limit = 20, category, search } = req.query;
    const offset = (page - 1) * limit;

    // Only show approved and active services to the public
    const whereClause = { 
      isActive: true,
      approvalStatus: 'approved' // Only show approved services
    };

    if (category) {
      whereClause.category = category;
    }

    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows: services } = await Service.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name']
      }]
    });

    return res.json({ 
      success: true, 
      services,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all active services error:', error);
    return res.status(500).json({ message: 'فشل في جلب الخدمات' });
  }
}

// Get single service
async function getService(req, res) {
  try {
    const { serviceId } = req.params;

    const service = await Service.findByPk(serviceId, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }]
    });

    if (!service) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }

    // Increment views count
    service.viewsCount = (service.viewsCount || 0) + 1;
    await service.save();

    return res.json({ 
      success: true, 
      service 
    });
  } catch (error) {
    console.error('Get service error:', error);
    return res.status(500).json({ message: 'فشل في جلب الخدمة' });
  }
}

// Update service
async function updateService(req, res) {
  try {
    const userId = req.userId;
    const { serviceId } = req.params;
    const { title, description, price, currency, purchaseLink, category, tags, isActive } = req.body;

    const service = await Service.findOne({
      where: {
        id: serviceId,
        userId: userId
      }
    });

    if (!service) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }

    // Update fields
    if (title !== undefined) service.title = title;
    if (description !== undefined) service.description = description;
    if (price !== undefined) service.price = parseFloat(price);
    if (currency !== undefined) service.currency = currency;
    if (purchaseLink !== undefined) service.purchaseLink = purchaseLink;
    if (category !== undefined) service.category = category;
    if (tags !== undefined) service.tags = Array.isArray(tags) ? tags : JSON.parse(tags);
    if (isActive !== undefined) service.isActive = isActive;

    // Handle image upload if provided
    if (req.file) {
      // Save relative path from uploads directory
      service.image = `services/${req.file.filename}`;
    }

    await service.save();

    return res.json({ 
      success: true, 
      service,
      message: 'تم تحديث الخدمة بنجاح' 
    });
  } catch (error) {
    console.error('Update service error:', error);
    return res.status(500).json({ message: 'فشل في تحديث الخدمة' });
  }
}

// Delete service
async function deleteService(req, res) {
  try {
    const userId = req.userId;
    const { serviceId } = req.params;

    const service = await Service.findOne({
      where: {
        id: serviceId,
        userId: userId
      }
    });

    if (!service) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }

    await service.destroy();

    return res.json({ 
      success: true, 
      message: 'تم حذف الخدمة بنجاح' 
    });
  } catch (error) {
    console.error('Delete service error:', error);
    return res.status(500).json({ message: 'فشل في حذف الخدمة' });
  }
}

// Increment click count
async function incrementClickCount(req, res) {
  try {
    const { serviceId } = req.params;

    const service = await Service.findByPk(serviceId);

    if (!service) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }

    service.clicksCount = (service.clicksCount || 0) + 1;
    await service.save();

    return res.json({ 
      success: true, 
      message: 'تم تسجيل الضغطة' 
    });
  } catch (error) {
    console.error('Increment click count error:', error);
    return res.status(500).json({ message: 'فشل في تسجيل الضغطة' });
  }
}

// Get service stats (for owner)
async function getServiceStats(req, res) {
  try {
    const userId = req.userId;
    const { serviceId } = req.params;

    const service = await Service.findOne({
      where: {
        id: serviceId,
        userId: userId
      }
    });

    if (!service) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }

    const stats = {
      views: service.viewsCount || 0,
      clicks: service.clicksCount || 0,
      clickRate: service.viewsCount > 0 
        ? ((service.clicksCount / service.viewsCount) * 100).toFixed(2) 
        : 0
    };

    return res.json({ 
      success: true, 
      stats 
    });
  } catch (error) {
    console.error('Get service stats error:', error);
    return res.status(500).json({ message: 'فشل في جلب الإحصائيات' });
  }
}

// Admin: Get all services pending approval
async function getPendingServices(req, res) {
  try {
    const services = await Service.findAll({
      where: { 
        approvalStatus: 'pending' 
      },
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }]
    });

    return res.json({ 
      success: true, 
      services 
    });
  } catch (error) {
    console.error('Get pending services error:', error);
    return res.status(500).json({ message: 'فشل في جلب الخدمات المعلقة' });
  }
}

// Admin: Get all services (with filter)
async function getAllServicesAdmin(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) {
      whereClause.approvalStatus = status;
    }

    const { count, rows: services } = await Service.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']],
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'name', 'email']
      }]
    });

    return res.json({ 
      success: true, 
      services,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get all services admin error:', error);
    return res.status(500).json({ message: 'فشل في جلب الخدمات' });
  }
}

// Admin: Approve service
async function approveService(req, res) {
  try {
    const { serviceId } = req.params;

    const service = await Service.findByPk(serviceId);

    if (!service) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }

    service.approvalStatus = 'approved';
    service.rejectionReason = null;
    service.isActive = true; // Activate service when approved
    await service.save();

    return res.json({ 
      success: true, 
      service,
      message: 'تمت الموافقة على الخدمة بنجاح وتم تنشيطها' 
    });
  } catch (error) {
    console.error('Approve service error:', error);
    return res.status(500).json({ message: 'فشل في الموافقة على الخدمة' });
  }
}

// Admin: Reject service
async function rejectService(req, res) {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;

    const service = await Service.findByPk(serviceId);

    if (!service) {
      return res.status(404).json({ message: 'الخدمة غير موجودة' });
    }

    service.approvalStatus = 'rejected';
    service.rejectionReason = reason || 'لم يتم تحديد السبب';
    service.isActive = false; // Deactivate rejected services
    await service.save();

    return res.json({ 
      success: true, 
      service,
      message: 'تم رفض الخدمة' 
    });
  } catch (error) {
    console.error('Reject service error:', error);
    return res.status(500).json({ message: 'فشل في رفض الخدمة' });
  }
}

module.exports = {
  createService,
  getUserServices,
  getAllActiveServices,
  getService,
  updateService,
  deleteService,
  incrementClickCount,
  getServiceStats,
  // Admin functions
  getPendingServices,
  getAllServicesAdmin,
  approveService,
  rejectService
};
