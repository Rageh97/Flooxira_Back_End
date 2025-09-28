const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  exchangeCode,
  getYouTubeAccount,
  disconnectYouTube,
  testYouTubeConnection,
  getYouTubeChannels,
  selectYouTubeChannel
} = require('../controllers/youtube.controller');

router.use(auth.requireAuth);

router.post('/exchange', exchangeCode);
router.get('/account', getYouTubeAccount);
router.get('/test', testYouTubeConnection);
router.post('/disconnect', disconnectYouTube);
router.get('/channels', getYouTubeChannels);
router.post('/select-channel', selectYouTubeChannel);

module.exports = router;












