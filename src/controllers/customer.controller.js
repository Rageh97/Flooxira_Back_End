const { Customer } = require('../models/customer');
const { CustomerInteraction } = require('../models/customerInteraction');
const { CustomerCategory } = require('../models/customerCategory');
const { CustomField } = require('../models/customField');
const { User } = require('../models/user');
const { Op } = require('sequelize');

// إنشاء عميل جديد
async function createCustomer(req, res) {
  try {
    const userId = req.userId;
    const {
      name,
      email,
      phone,
      categoryName,
      productName,
      subscriptionType,
      subscriptionStartDate,
      subscriptionEndDate,
      subscriptionStatus,
      tags,
      customFields,
      purchasePrice,
      salePrice,
      lastContactDate,
      nextFollowUpDate,
      address,
      socialMedia,
      storeName
    } = req.body;

    console.log('Creating customer with customFields:', customFields);
    console.log('CustomFields type:', typeof customFields);
    console.log('Full request body:', req.body);
    
    // Parse customFields if it's a string
    let parsedCustomFields = customFields || {};
    if (typeof customFields === 'string') {
      try {
        parsedCustomFields = JSON.parse(customFields);
      } catch (e) {
        console.error('Error parsing customFields:', e);
        parsedCustomFields = {};
      }
    }
    
    console.log('Parsed customFields:', parsedCustomFields);
    console.log('Parsed customFields keys:', Object.keys(parsedCustomFields));
    console.log('Parsed customFields values:', Object.values(parsedCustomFields));

    // البحث عن التصنيف أو إنشاؤه
    let category = null;
    if (categoryName) {
      category = await CustomerCategory.findOne({
        where: { name: categoryName, userId }
      });
      
      if (!category) {
        category = await CustomerCategory.create({
          userId,
          name: categoryName,
          description: `تصنيف ${categoryName}`
        });
      }
    }

    // Handle invoice image
    let invoiceImagePath = null;
    if (req.file) {
      const baseUrl = process.env.API_URL || `https://api.flooxira.com`;
      invoiceImagePath = `${baseUrl}/uploads/customers/${req.file.filename}`;
      console.log('Invoice image saved:', invoiceImagePath);
      console.log('Base URL:', baseUrl);
      console.log('File name:', req.file.filename);
    }

    console.log('Saving customer with customFields:', parsedCustomFields);
    
    const customer = await Customer.create({
      userId,
      name,
      email,
      phone,
      categoryId: category?.id,
      productName,
      subscriptionType,
      subscriptionStartDate,
      subscriptionEndDate,
      subscriptionStatus: subscriptionStatus || 'inactive',
      tags: tags || [],
      customFields: parsedCustomFields,
      purchasePrice: purchasePrice || 0,
      salePrice: salePrice || 0,
      lastContactDate,
      nextFollowUpDate,
      address,
      socialMedia: socialMedia || {},
      invoiceImage: invoiceImagePath,
      storeName
    });

    console.log('Customer created with ID:', customer.id);
    console.log('Customer customFields after creation:', customer.customFields);
    console.log('Customer customFields type after creation:', typeof customer.customFields);
    console.log('Customer customFields keys after creation:', Object.keys(customer.customFields || {}));
    console.log('Customer customFields values after creation:', Object.values(customer.customFields || {}));

    // جلب العميل مع البيانات المرتبطة
    const customerWithDetails = await Customer.findByPk(customer.id, {
      include: [
        {
          model: CustomerCategory,
          as: 'category',
          required: false
        }
      ]
    });

    console.log('Created customer with invoice image:', customerWithDetails.invoiceImage);

    // Ensure customFields is an object
    if (customerWithDetails && customerWithDetails.customFields) {
      if (typeof customerWithDetails.customFields === 'string') {
        try {
          customerWithDetails.customFields = JSON.parse(customerWithDetails.customFields);
        } catch (e) {
          customerWithDetails.customFields = {};
        }
      }
    }
    
    console.log('Customer with details customFields:', customerWithDetails.customFields);
    console.log('Customer with details customFields type:', typeof customerWithDetails.customFields);
    console.log('Customer with details customFields keys:', Object.keys(customerWithDetails.customFields || {}));
    console.log('Customer with details customFields values:', Object.values(customerWithDetails.customFields || {}));

    res.status(201).json({
      success: true,
      message: 'تم إنشاء العميل بنجاح',
      data: customerWithDetails
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في إنشاء العميل',
      error: error.message
    });
  }
}

// جلب جميع العملاء مع الفلترة والبحث
async function getCustomers(req, res) {
  try {
    const userId = req.userId;
    const {
      page = 1,
      limit = 10,
      search = '',
      category = '',
      product = '',
      subscriptionType = '',
      subscriptionStatus = 'all',
      planId = '',
      isVip = '',
      storeName = '',
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = req.query;

    const offset = (page - 1) * limit;
    const whereConditions = [{ userId }];

    // إضافة شروط البحث
    if (search) {
      whereConditions.push({
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
          { productName: { [Op.like]: `%${search}%` } }
        ]
      });
    }

    if (subscriptionType) {
      whereConditions.push({ subscriptionType });
    }

    if (planId) {
      whereConditions.push({ planId });
    }

    if (isVip !== '') {
      whereConditions.push({ isVip: isVip === 'true' });
    }

    if (product) {
      whereConditions.push({ productName: { [Op.like]: `%${product}%` } });
    }

    if (storeName) {
      whereConditions.push({ storeName: { [Op.like]: `%${storeName}%` } });
    }

    // فلترة حسب حالة الاشتراك
    if (subscriptionStatus && subscriptionStatus !== 'all') {
      if (subscriptionStatus === 'active') {
        whereConditions.push({
          [Op.or]: [
            { subscriptionStatus: 'active' },
            { 
              subscriptionStatus: { [Op.is]: null },
              subscriptionEndDate: { [Op.gt]: new Date() }
            }
          ]
        });
      } else if (subscriptionStatus === 'expired') {
        whereConditions.push({
          [Op.or]: [
            { subscriptionStatus: 'expired' },
            { 
              subscriptionStatus: { [Op.is]: null },
              subscriptionEndDate: { [Op.lte]: new Date() }
            }
          ]
        });
      } else if (subscriptionStatus === 'inactive') {
        whereConditions.push({
          [Op.or]: [
            { subscriptionStatus: 'inactive' },
            { 
              subscriptionStatus: { [Op.is]: null },
              subscriptionEndDate: { [Op.is]: null }
            }
          ]
        });
      }
    }

    // دمج جميع الشروط باستخدام AND
    const whereClause = { [Op.and]: whereConditions };

    // فلترة حسب التصنيف
    let includeCategory = [];
    if (category) {
      includeCategory = [{
        model: CustomerCategory,
        as: 'category',
        where: { name: category },
        required: true
      }];
    } else {
      includeCategory = [{
        model: CustomerCategory,
        as: 'category',
        required: false
      }];
    }

    const { count, rows: customers } = await Customer.findAndCountAll({
      where: whereClause,
      include: includeCategory,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // تحديث حالة الاشتراك تلقائياً لكل عميل
    for (let customer of customers) {
      await updateSubscriptionStatus(customer);
      
      // Ensure customFields is an object, not a string
      if (customer.customFields) {
        if (typeof customer.customFields === 'string') {
          try {
            customer.customFields = JSON.parse(customer.customFields);
          } catch (e) {
            customer.customFields = {};
          }
        }
      } else {
        customer.customFields = {};
      }


      // Ensure tags is an array, not a string
      if (customer.tags) {
        if (typeof customer.tags === 'string') {
          try {
            customer.tags = JSON.parse(customer.tags);
          } catch (e) {
            customer.tags = [];
          }
        }
      } else {
        customer.tags = [];
      }

      // Ensure socialMedia is an object, not a string
      if (customer.socialMedia) {
        if (typeof customer.socialMedia === 'string') {
          try {
            customer.socialMedia = JSON.parse(customer.socialMedia);
          } catch (e) {
            customer.socialMedia = {};
          }
        }
      } else {
        customer.socialMedia = {};
      }

    }

    // Debug custom fields
    console.log('Customers customFields summary:', customers.map(c => ({ 
      name: c.name, 
      customFieldsCount: Object.keys(c.customFields || {}).length,
      customFields: c.customFields 
    })));
    
    // Debug invoice images
    console.log('Customers invoice images:', customers.map(c => ({ 
      name: c.name, 
      invoiceImage: c.invoiceImage,
      invoiceImageType: typeof c.invoiceImage,
      invoiceImageLength: c.invoiceImage?.length
    })));
    
    // Check if custom fields are being loaded correctly
    const availableFields = await CustomField.findAll({ where: { userId } });
    console.log('Available custom fields:', availableFields.map(f => ({ id: f.id, name: f.name, label: f.label })));
    
    // Check for any customers with custom fields
    for (let customer of customers) {
      if (customer.customFields && Object.keys(customer.customFields).length > 0) {
        console.log(`Customer ${customer.name} has custom fields:`, customer.customFields);
        for (let [fieldName, fieldValue] of Object.entries(customer.customFields)) {
          const field = availableFields.find(f => f.name === fieldName);
          if (field) {
            console.log(`  Field ${fieldName} (${field.label}): ${fieldValue}`);
          } else {
            console.log(`  Field ${fieldName} not found in available fields`);
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        customers,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting customers:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في جلب العملاء',
      error: error.message
    });
  }
}

// جلب عميل واحد
async function getCustomer(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const customer = await Customer.findOne({
      where: { id, userId },
      include: [
        {
          model: CustomerCategory,
          as: 'category',
          required: false
        }
      ]
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'العميل غير موجود'
      });
    }

    // Ensure customFields is an object
    if (customer.customFields) {
      if (typeof customer.customFields === 'string') {
        try {
          customer.customFields = JSON.parse(customer.customFields);
        } catch (e) {
          customer.customFields = {};
        }
      }
    } else {
      customer.customFields = {};
    }

    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Error getting customer:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في جلب العميل',
      error: error.message
    });
  }
}

// تحديث عميل
async function updateCustomer(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const updateData = req.body;

    console.log('Updating customer with customFields:', updateData.customFields);
    
    // Parse customFields if it's a string
    if (updateData.customFields && typeof updateData.customFields === 'string') {
      try {
        updateData.customFields = JSON.parse(updateData.customFields);
      } catch (e) {
        console.error('Error parsing customFields in update:', e);
        updateData.customFields = {};
      }
    }

    const customer = await Customer.findOne({
      where: { id, userId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'العميل غير موجود'
      });
    }

    // Handle category update
    if (updateData.categoryName) {
      let category = await CustomerCategory.findOne({
        where: { name: updateData.categoryName, userId }
      });
      
      if (!category) {
        category = await CustomerCategory.create({
          userId,
          name: updateData.categoryName,
          description: `تصنيف ${updateData.categoryName}`
        });
      }
      
      updateData.categoryId = category.id;
      delete updateData.categoryName;
    }

    // Handle invoice image update
    if (req.file) {
      const baseUrl = process.env.API_URL || `https://api.flooxira.com`;
      updateData.invoiceImage = `${baseUrl}/uploads/customers/${req.file.filename}`;
    }

    // Ensure invoiceImage is a string, not an array or object
    if (updateData.invoiceImage && typeof updateData.invoiceImage !== 'string') {
      if (Array.isArray(updateData.invoiceImage)) {
        updateData.invoiceImage = updateData.invoiceImage[0] || null;
      } else if (typeof updateData.invoiceImage === 'object') {
        updateData.invoiceImage = updateData.invoiceImage.url || updateData.invoiceImage.path || null;
      }
    }

    await customer.update(updateData);

    // جلب العميل المحدث مع البيانات المرتبطة
    const updatedCustomer = await Customer.findByPk(customer.id, {
      include: [
        {
          model: CustomerCategory,
          as: 'category',
          required: false
        }
      ]
    });

    // Ensure customFields is an object
    if (updatedCustomer.customFields) {
      if (typeof updatedCustomer.customFields === 'string') {
        try {
          updatedCustomer.customFields = JSON.parse(updatedCustomer.customFields);
        } catch (e) {
          updatedCustomer.customFields = {};
        }
      }
    } else {
      updatedCustomer.customFields = {};
    }


    res.json({
      success: true,
      message: 'تم تحديث العميل بنجاح',
      data: updatedCustomer
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في تحديث العميل',
      error: error.message
    });
  }
}

// حذف عميل
async function deleteCustomer(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const customer = await Customer.findOne({
      where: { id, userId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'العميل غير موجود'
      });
    }

    // حذف التفاعلات المرتبطة أولاً
    await CustomerInteraction.destroy({
      where: { customerId: id }
    });

    // حذف العميل
    await customer.destroy();

    res.json({
      success: true,
      message: 'تم حذف العميل بنجاح'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في حذف العميل',
      error: error.message
    });
  }
}

// تحديث حالة الاشتراك تلقائياً
async function updateSubscriptionStatus(customer) {
  if (!customer.subscriptionEndDate) return 'inactive';
  
  const endDate = new Date(customer.subscriptionEndDate);
  const now = new Date();
  
  let newStatus = 'inactive';
  if (endDate > now) {
    newStatus = 'active';
  } else {
    newStatus = 'expired';
  }
  
  // تحديث الحالة في قاعدة البيانات إذا كانت مختلفة
  if (customer.subscriptionStatus !== newStatus) {
    await Customer.update(
      { subscriptionStatus: newStatus },
      { where: { id: customer.id } }
    );
    customer.subscriptionStatus = newStatus;
  }
  
  return newStatus;
}

// إحصائيات العملاء
async function getCustomerStats(req, res) {
  try {
    const userId = req.userId;

    const [
      totalCustomers,
      activeCustomers,
      customersByType,
      customersByStatus,
      recentCustomers,
      financialStats
    ] = await Promise.all([
      Customer.count({ where: { userId } }),
      Customer.count({ where: { userId, subscriptionStatus: 'active' } }),
      Customer.findAll({
        where: { userId },
        attributes: [
          'subscriptionType',
          [Customer.sequelize.fn('COUNT', Customer.sequelize.col('id')), 'count']
        ],
        group: ['subscriptionType']
      }),
      Customer.findAll({
        where: { userId },
        attributes: [
          'subscriptionStatus',
          [Customer.sequelize.fn('COUNT', Customer.sequelize.col('id')), 'count']
        ],
        group: ['subscriptionStatus']
      }),
      Customer.findAll({
        where: { userId },
        order: [['createdAt', 'DESC']],
        limit: 5
      }),
      Customer.findAll({
        where: { userId },
        attributes: [
          [Customer.sequelize.fn('SUM', Customer.sequelize.col('purchasePrice')), 'totalCapital'],
          [Customer.sequelize.fn('SUM', Customer.sequelize.col('salePrice')), 'totalRevenue']
        ],
        raw: true
      })
    ]);

    // حساب الإحصائيات المالية
    const totalCapital = parseFloat(financialStats[0]?.totalCapital || 0);
    const totalRevenue = parseFloat(financialStats[0]?.totalRevenue || 0);
    const netProfit = totalRevenue - totalCapital;

    res.json({
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        vipCustomers: 0,
        customersByType,
        customersByStatus,
        recentCustomers,
        financial: {
          totalCapital: totalCapital.toFixed(2),
          totalRevenue: totalRevenue.toFixed(2),
          netProfit: netProfit.toFixed(2)
        }
      }
    });
  } catch (error) {
    console.error('Error getting customer stats:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في جلب إحصائيات العملاء',
      error: error.message
    });
  }
}

// إضافة تفاعل مع العميل
async function addCustomerInteraction(req, res) {
  try {
    const userId = req.userId;
    const { customerId } = req.params;
    const {
      type,
      subject,
      description,
      outcome,
      followUpRequired,
      followUpDate,
      attachments
    } = req.body;

    // التحقق من وجود العميل
    const customer = await Customer.findOne({
      where: { id: customerId, userId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'العميل غير موجود'
      });
    }

    const interaction = await CustomerInteraction.create({
      customerId,
      userId,
      type,
      subject,
      description,
      outcome,
      followUpRequired,
      followUpDate,
      attachments: attachments || []
    });

    // تحديث تاريخ آخر تواصل مع العميل
    await customer.update({
      lastContactDate: new Date()
    });

    res.status(201).json({
      success: true,
      message: 'تم إضافة التفاعل بنجاح',
      data: interaction
    });
  } catch (error) {
    console.error('Error adding customer interaction:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في إضافة التفاعل',
      error: error.message
    });
  }
}

// جلب تفاعلات العميل
async function getCustomerInteractions(req, res) {
  try {
    const userId = req.userId;
    const { customerId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const offset = (page - 1) * limit;

    // التحقق من وجود العميل
    const customer = await Customer.findOne({
      where: { id: customerId, userId }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'العميل غير موجود'
      });
    }

    const { count, rows: interactions } = await CustomerInteraction.findAndCountAll({
      where: { customerId },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        interactions,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      }
    });
  } catch (error) {
    console.error('Error getting customer interactions:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في جلب تفاعلات العميل',
      error: error.message
    });
  }
}

// إدارة التصنيفات
async function getCategories(req, res) {
  try {
    const userId = req.userId;
    const categories = await CustomerCategory.findAll({
      where: { userId },
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في جلب التصنيفات',
      error: error.message
    });
  }
}

async function createCategory(req, res) {
  try {
    const userId = req.userId;
    const { name, description, color } = req.body;

    const category = await CustomerCategory.create({
      userId,
      name,
      description,
      color: color || '#3B82F6'
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء التصنيف بنجاح',
      data: category
    });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في إنشاء التصنيف',
      error: error.message
    });
  }
}

module.exports = {
  createCustomer,
  getCustomers,
  getCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerStats,
  addCustomerInteraction,
  getCustomerInteractions,
  getCategories,
  createCategory
};
