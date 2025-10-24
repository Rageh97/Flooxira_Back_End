const express = require('express');
const router = express.Router();
const { requireEmployeeAuth } = require('../middleware/auth');
const { requireActiveSubscription, requireFeatureAccess } = require('../middleware/permissions');
const { serviceUpload } = require('../middleware/upload');
const {
  createService,
  getUserServices,
  getAllActiveServices,
  getService,
  updateService,
  deleteService,
  incrementClickCount,
  getServiceStats
} = require('../controllers/service.controller');

// Public routes
router.get('/public', getAllActiveServices); // Get all active services for public display
router.get('/:serviceId/view', getService); // Get single service (increments view count)
router.post('/:serviceId/click', incrementClickCount); // Increment click count

// Protected routes (require authentication)
router.use(requireEmployeeAuth);
router.use(requireActiveSubscription);
router.use(requireFeatureAccess('canMarketServices'));

router.post('/', serviceUpload.single('image'), createService); // Create new service
router.get('/', getUserServices); // Get user's services
router.put('/:serviceId', serviceUpload.single('image'), updateService); // Update service
router.delete('/:serviceId', deleteService); // Delete service
router.get('/:serviceId/stats', getServiceStats); // Get service stats

module.exports = router;
