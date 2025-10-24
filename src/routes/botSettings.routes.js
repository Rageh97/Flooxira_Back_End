const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const botSettingsController = require('../controllers/botSettings.controller');

const router = Router();
router.use(requireAuth);

// Get bot settings
router.get('/', botSettingsController.getBotSettings);

// Update bot settings
router.put('/', botSettingsController.updateBotSettings);

// Reset bot settings to default
router.delete('/', botSettingsController.resetBotSettings);

// Test AI response with current settings
router.post('/test', botSettingsController.testAIResponse);

// Get available AI models
router.get('/models', botSettingsController.getAvailableModels);

// Get personality templates
router.get('/templates', botSettingsController.getPersonalityTemplates);

module.exports = router;








