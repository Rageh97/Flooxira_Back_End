const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  getBotSettings,
  updateBotSettings,
  resetBotSettings,
  testAIResponse,
  getAvailableModels,
  getPersonalityTemplates
} = require('../controllers/botSettings.controller');

// Apply authentication middleware to all routes
router.use(requireAuth);

// Get bot settings
router.get('/', getBotSettings);

// Update bot settings
router.put('/', updateBotSettings);

// Reset bot settings to default
router.post('/reset', resetBotSettings);

// Test AI response with current settings
router.post('/test', testAIResponse);

// Get available AI models
router.get('/models', getAvailableModels);

// Get personality templates
router.get('/templates', getPersonalityTemplates);

module.exports = router;




