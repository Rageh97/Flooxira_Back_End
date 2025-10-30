const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  getPendingServices,
  getAllServicesAdmin,
  approveService,
  rejectService
} = require('../controllers/service.controller');

// All routes require admin authentication
router.use(requireAdmin);

router.get('/pending', getPendingServices); // Get pending services
router.get('/', getAllServicesAdmin); // Get all services with filter
router.put('/:serviceId/approve', approveService); // Approve service
router.put('/:serviceId/reject', rejectService); // Reject service

module.exports = router;

