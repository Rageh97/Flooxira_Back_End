const express = require('express');
const router = express.Router();
const customFieldController = require('../controllers/customField.controller');
const { requireAuth } = require('../middleware/auth');
const { requireActiveSubscription, requireFeatureAccess } = require('../middleware/permissions');

// Middleware للتحقق من وجود اشتراك نشط وإمكانية الوصول لميزة إدارة العملاء
const requireCustomerManagementAccess = [
  requireAuth,
  requireActiveSubscription,
  requireFeatureAccess('canManageCustomers')
];

// Routes للحقول المخصصة
router.get('/', requireCustomerManagementAccess, customFieldController.getCustomFields);
router.post('/', requireCustomerManagementAccess, customFieldController.createCustomField);
router.put('/:id', requireCustomerManagementAccess, customFieldController.updateCustomField);
router.delete('/:id', requireCustomerManagementAccess, customFieldController.deleteCustomField);
router.put('/order/update', requireCustomerManagementAccess, customFieldController.updateCustomFieldsOrder);

module.exports = router;


