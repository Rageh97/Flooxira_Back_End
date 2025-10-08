const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getFacebookAnalytics,
  getLinkedInAnalytics,
  getTwitterAnalytics,
  getYouTubeAnalytics,
  getPinterestAnalytics,
  getAllAnalytics
} = require('../controllers/analytics.controller');

// Get all analytics
router.get('/', requireAuth, getAllAnalytics);

// Get Facebook analytics
router.get('/facebook', requireAuth, getFacebookAnalytics);

// Get LinkedIn analytics
router.get('/linkedin', requireAuth, getLinkedInAnalytics);

// Get Twitter analytics
router.get('/twitter', requireAuth, getTwitterAnalytics);

// Get YouTube analytics
router.get('/youtube', requireAuth, getYouTubeAnalytics);

// Get Pinterest analytics
router.get('/pinterest', requireAuth, getPinterestAnalytics);

module.exports = router;

