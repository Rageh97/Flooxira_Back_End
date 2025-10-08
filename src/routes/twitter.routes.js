const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { 
  requireActiveSubscription, 
  requirePlatformAccess 
} = require('../middleware/permissions');
const controller = require('../controllers/twitter.controller');

const router = Router();

router.post('/exchange', requireAuth, requireActiveSubscription, requirePlatformAccess('twitter'), controller.exchangeCode);
router.post('/disconnect', requireAuth, requireActiveSubscription, requirePlatformAccess('twitter'), controller.disconnect);
router.post('/tweet', requireAuth, requireActiveSubscription, requirePlatformAccess('twitter'), controller.createTweet);

// Platform details routes
router.get('/account', requireAuth, requireActiveSubscription, requirePlatformAccess('twitter'), controller.getAccount);

module.exports = router;

