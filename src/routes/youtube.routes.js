const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  requireActiveSubscription, 
  requirePlatformAccess 
} = require('../middleware/permissions');
const {
  exchangeCode,
  getYouTubeAccount,
  disconnectYouTube,
  testYouTubeConnection,
  getYouTubeChannels,
  selectYouTubeChannel,
  getYouTubeChannelDetails
} = require('../controllers/youtube.controller');

router.use(auth.requireAuth);
router.use(requireActiveSubscription);
router.use(requirePlatformAccess('youtube'));

router.post('/exchange', exchangeCode);
router.get('/account', getYouTubeAccount);
router.get('/test', testYouTubeConnection);
router.post('/disconnect', disconnectYouTube);
router.get('/channels', getYouTubeChannels);
router.post('/select-channel', selectYouTubeChannel);

// Platform details routes
router.get('/channel', getYouTubeChannelDetails);

module.exports = router;












