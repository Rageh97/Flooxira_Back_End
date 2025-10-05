const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { sendToTag } = require('../controllers/campaign.controller');

router.post('/campaigns/send-to-tag', requireAuth, sendToTag);

module.exports = router;







