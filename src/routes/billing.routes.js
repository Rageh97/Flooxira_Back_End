const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getBillingAnalytics,
  getInvoices,
  getRevenueChartData,
  getPlanDistribution,
  getPaymentMethodDistribution,
  getSubscriptionTimeline
} = require('../controllers/billing.controller');

// Apply authentication middleware to all routes
router.use(requireAuth);

// Billing analytics
router.get('/analytics', getBillingAnalytics);

// Invoices
router.get('/invoices', getInvoices);

// Chart data
router.get('/revenue-chart', getRevenueChartData);

// Distribution data
router.get('/plan-distribution', getPlanDistribution);
router.get('/payment-method-distribution', getPaymentMethodDistribution);

// Timeline
router.get('/timeline', getSubscriptionTimeline);

module.exports = router;
