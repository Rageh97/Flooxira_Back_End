const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { mediaUploader, sendMedia } = require('../controllers/media.controller');

router.post('/whatsapp/media', requireAuth, mediaUploader, sendMedia);

module.exports = router;







