const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const { requireAuth } = require('../middleware/auth');
const { requireActiveSubscription, requireFeatureAccess } = require('../middleware/permissions');
const { customerUpload } = require('../middleware/upload');

// Middleware للتحقق من وجود اشتراك نشط وإمكانية الوصول لميزة إدارة العملاء
const requireCustomerManagementAccess = [
  requireAuth,
  requireActiveSubscription,
  requireFeatureAccess('canManageCustomers')
];

// Routes للتصنيفات (يجب أن تكون قبل /:id)
router.get('/categories', requireCustomerManagementAccess, customerController.getCategories);
router.post('/categories', requireCustomerManagementAccess, customerController.createCategory);

// Routes للعملاء
router.post('/', requireCustomerManagementAccess, customerUpload.single('invoiceImage'), customerController.createCustomer);
router.get('/', requireCustomerManagementAccess, customerController.getCustomers);
router.get('/stats', requireCustomerManagementAccess, customerController.getCustomerStats);
router.get('/:id', requireCustomerManagementAccess, customerController.getCustomer);
router.put('/:id', requireCustomerManagementAccess, customerUpload.single('invoiceImage'), customerController.updateCustomer);
router.delete('/:id', requireCustomerManagementAccess, customerController.deleteCustomer);

// Routes للتفاعلات
router.post('/:customerId/interactions', requireCustomerManagementAccess, customerController.addCustomerInteraction);
router.get('/:customerId/interactions', requireCustomerManagementAccess, customerController.getCustomerInteractions);

module.exports = router;
