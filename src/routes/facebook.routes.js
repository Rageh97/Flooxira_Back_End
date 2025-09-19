const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
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
  disconnectFacebook
} = require('../controllers/facebook.controller');
const { getFacebookPagesMake, selectFacebookPageMake } = require('../controllers/facebook.make.controller');

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Exchange OAuth code for access token
router.post('/exchange', exchangeCode);

// Get connected Facebook account info
router.get('/account', getFacebookAccount);

// Test Facebook connection
router.get('/test', testFacebookConnection);

// Get Facebook pages (Make-based)
router.get('/pages', process.env.USE_MAKE_API === 'true' ? getFacebookPagesMake : getFacebookPages);

// Select a Facebook page (Make-based)
router.post('/select-page', process.env.USE_MAKE_API === 'true' ? selectFacebookPageMake : selectFacebookPage);

// Get Facebook groups
router.get('/groups', getFacebookGroups);

// Select a Facebook group
router.post('/select-group', selectFacebookGroup);

// Instagram endpoints
router.get('/instagram-accounts', getInstagramAccounts);
router.post('/select-instagram', selectInstagramAccount);

// Disconnect Facebook account
router.post('/disconnect', disconnectFacebook);

module.exports = router;


