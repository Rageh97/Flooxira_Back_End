const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const {
  createSubscriptionRequest,
  uploadReceipt,
  getUserSubscriptionRequests,
  getAllSubscriptionRequests,
  updateSubscriptionRequestStatus,
  validateCoupon,
  getUserSubscription,
  getUSDTWalletInfo
} = require('../controllers/subscriptionRequest.controller');

// Public routes
router.get('/wallet-info', getUSDTWalletInfo);

// User routes
router.post('/', requireAuth, createSubscriptionRequest);
router.get('/my-requests', requireAuth, getUserSubscriptionRequests);
router.get('/my-subscription', requireAuth, getUserSubscription);
router.get('/validate-coupon', requireAuth, validateCoupon);
router.post('/:requestId/upload-receipt', requireAuth, upload.single('receipt'), uploadReceipt);

// Alternative endpoint for subscription
router.get('/subscription', requireAuth, getUserSubscription);

// Admin routes
router.get('/admin/all', requireAuth, getAllSubscriptionRequests);
router.put('/admin/:requestId/status', requireAuth, updateSubscriptionRequestStatus);

module.exports = router;
