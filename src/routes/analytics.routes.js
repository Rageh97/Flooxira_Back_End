const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  getFacebookAnalytics,
  getLinkedInAnalytics,
  getTwitterAnalytics,
  getYouTubeAnalytics,
  getPinterestAnalytics,
  getAllAnalytics
} = require('../controllers/analytics.controller');

// Get all analytics
router.get('/', authenticate, getAllAnalytics);

// Get Facebook analytics
router.get('/facebook', authenticate, getFacebookAnalytics);

// Get LinkedIn analytics
router.get('/linkedin', authenticate, getLinkedInAnalytics);

// Get Twitter analytics
router.get('/twitter', authenticate, getTwitterAnalytics);

// Get YouTube analytics
router.get('/youtube', authenticate, getYouTubeAnalytics);

// Get Pinterest analytics
router.get('/pinterest', authenticate, getPinterestAnalytics);

module.exports = router;

