const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  exchangeCode,
  getLinkedInAccount,
  disconnectLinkedIn,
  testLinkedInConnection,
  createLinkedInPost,
  createLinkedInPostWithImage,
  getLinkedInPosts,
  getLinkedInAnalytics,
  getLinkedInCompanies
} = require('../controllers/linkedin.controller');

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Exchange OAuth code for access token
router.post('/exchange', exchangeCode);

// Get connected LinkedIn account info
router.get('/account', getLinkedInAccount);

// Test LinkedIn connection
router.get('/test', testLinkedInConnection);

// Disconnect LinkedIn account
router.post('/disconnect', disconnectLinkedIn);

// Posts management
router.post('/posts', createLinkedInPost);
router.post('/posts/with-image', createLinkedInPostWithImage);
router.get('/posts', getLinkedInPosts);

// Analytics
router.get('/analytics', getLinkedInAnalytics);

// Company pages (if user has admin access)
router.get('/companies', getLinkedInCompanies);

module.exports = router;


