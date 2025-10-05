const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getBotStatus, pauseBot, resumeBot } = require('../controllers/botControl.controller');

// All routes require authentication
router.use(requireAuth);

// Get bot status
router.get('/status', getBotStatus);

// Pause bot
router.post('/pause', pauseBot);

// Resume bot
router.post('/resume', resumeBot);

module.exports = router;


