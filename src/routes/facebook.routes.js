const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { 
  requireActiveSubscription, 
  requirePlatformAccess 
} = require('../middleware/permissions');
const {
  getFacebookAccount,
  getFacebookPages,
  selectFacebookPage,
  getFacebookGroups,
  selectFacebookGroup,
  exchangeCode,
  getInstagramAccounts,
  selectInstagramAccount,
  testFacebookConnection,
  disconnectFacebook,
  getConnectedAccounts
} = require('../controllers/facebook.controller');

const router = Router();

// All routes require authentication
router.use(requireAuth);
router.use(requireActiveSubscription);
router.use(requirePlatformAccess('facebook'));

// Exchange OAuth code for access token
router.post('/exchange', exchangeCode);

// Get connected Facebook account info
router.get('/account', getFacebookAccount);

// Test Facebook connection
router.get('/test', testFacebookConnection);

// Get Facebook pages
router.get('/pages', getFacebookPages);

// Select a Facebook page
router.post('/select-page', selectFacebookPage);

// Get Facebook groups
router.get('/groups', getFacebookGroups);

// Select a Facebook group
router.post('/select-group', selectFacebookGroup);

// Instagram endpoints
router.get('/instagram-accounts', getInstagramAccounts);
router.post('/select-instagram', selectInstagramAccount);

// Disconnect Facebook account
router.post('/disconnect', disconnectFacebook);

// Get all connected accounts
router.get('/connected-accounts', getConnectedAccounts);

module.exports = router;


