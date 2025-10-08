const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  requireActiveSubscription, 
  requirePlatformAccess 
} = require('../middleware/permissions');
const {
  exchangeCode,
  getTikTokAccount,
  disconnectTikTok,
  testTikTokConnection
} = require('../controllers/tiktok.controller');

// Apply authentication middleware to all routes
router.use(auth.requireAuth);
router.use(requireActiveSubscription);
router.use(requirePlatformAccess('tiktok'));

// TikTok OAuth code exchange
router.post('/exchange', exchangeCode);

// Get TikTok account info
router.get('/account', getTikTokAccount);

// Test TikTok connection
router.get('/test', testTikTokConnection);

// Disconnect TikTok account
router.post('/disconnect', disconnectTikTok);

module.exports = router;
