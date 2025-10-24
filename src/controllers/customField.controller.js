const { CustomField } = require('../models/customField');

// جلب جميع الحقول المخصصة للمستخدم
async function getCustomFields(req, res) {
  try {
    const userId = req.userId;
    
    const customFields = await CustomField.findAll({
      where: { userId },
      order: [['order', 'ASC'], ['createdAt', 'ASC']]
    });

    res.json({
      success: true,
      data: customFields
    });
  } catch (error) {
    console.error('Error getting custom fields:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في جلب الحقول المخصصة',
      error: error.message
    });
  }
}

// إنشاء حقل مخصص جديد
async function createCustomField(req, res) {
  try {
    const userId = req.userId;
    const { name, label, type, required, options, placeholder } = req.body;

    // التحقق من وجود حقل بنفس الاسم
    const existingField = await CustomField.findOne({
      where: { name, userId }
    });

    if (existingField) {
      return res.status(400).json({
        success: false,
        message: 'يوجد حقل مخصص بنفس الاسم بالفعل'
      });
    }

    // الحصول على آخر ترتيب
    const lastField = await CustomField.findOne({
      where: { userId },
      order: [['order', 'DESC']]
    });

    const order = lastField ? lastField.order + 1 : 1;

    const customField = await CustomField.create({
      userId,
      name,
      label,
      type,
      required: required || false,
      options: type === 'select' ? (options || []) : null,
      placeholder,
      order
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الحقل المخصص بنجاح',
      data: customField
    });
  } catch (error) {
    console.error('Error creating custom field:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في إنشاء الحقل المخصص',
      error: error.message
    });
  }
}

// تحديث حقل مخصص
async function updateCustomField(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { name, label, type, required, options, placeholder, order } = req.body;

    const customField = await CustomField.findOne({
      where: { id, userId }
    });

    if (!customField) {
      return res.status(404).json({
        success: false,
        message: 'الحقل المخصص غير موجود'
      });
    }

    // التحقق من وجود حقل آخر بنفس الاسم
    if (name !== customField.name) {
      const existingField = await CustomField.findOne({
        where: { name, userId, id: { [require('sequelize').Op.ne]: id } }
      });

      if (existingField) {
        return res.status(400).json({
          success: false,
          message: 'يوجد حقل مخصص بنفس الاسم بالفعل'
        });
      }
    }

    await customField.update({
      name,
      label,
      type,
      required: required || false,
      options: type === 'select' ? (options || []) : null,
      placeholder,
      order: order || customField.order
    });

    res.json({
      success: true,
      message: 'تم تحديث الحقل المخصص بنجاح',
      data: customField
    });
  } catch (error) {
    console.error('Error updating custom field:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في تحديث الحقل المخصص',
      error: error.message
    });
  }
}

// حذف حقل مخصص
async function deleteCustomField(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const customField = await CustomField.findOne({
      where: { id, userId }
    });

    if (!customField) {
      return res.status(404).json({
        success: false,
        message: 'الحقل المخصص غير موجود'
      });
    }

    await customField.destroy();

    res.json({
      success: true,
      message: 'تم حذف الحقل المخصص بنجاح'
    });
  } catch (error) {
    console.error('Error deleting custom field:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في حذف الحقل المخصص',
      error: error.message
    });
  }
}

// تحديث ترتيب الحقول
async function updateCustomFieldsOrder(req, res) {
  try {
    const userId = req.userId;
    const { fields } = req.body; // array of {id, order}

    for (const field of fields) {
      await CustomField.update(
        { order: field.order },
        { where: { id: field.id, userId } }
      );
    }

    res.json({
      success: true,
      message: 'تم تحديث ترتيب الحقول بنجاح'
    });
  } catch (error) {
    console.error('Error updating custom fields order:', error);
    res.status(500).json({
      success: false,
      message: 'فشل في تحديث ترتيب الحقول',
      error: error.message
    });
  }
}

module.exports = {
  getCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  updateCustomFieldsOrder
};


