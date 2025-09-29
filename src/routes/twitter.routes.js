const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const controller = require('../controllers/twitter.controller');

const router = Router();

router.post('/exchange', requireAuth, controller.exchangeCode);
router.post('/disconnect', requireAuth, controller.disconnect);
router.post('/tweet', requireAuth, controller.createTweet);

module.exports = router;

