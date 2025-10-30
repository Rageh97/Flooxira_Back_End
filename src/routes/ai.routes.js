const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { requireAuth } = require('../middleware/auth');

// All routes require authentication
router.use(requireAuth);

// Conversations
router.get('/conversations', aiController.getConversations);
router.post('/conversations', aiController.createConversation);
router.get('/conversations/:conversationId', aiController.getConversationMessages);
router.delete('/conversations/:conversationId', aiController.deleteConversation);
router.put('/conversations/:conversationId/title', aiController.updateConversationTitle);

// Messages
router.post('/conversations/:conversationId/messages', aiController.sendMessage);

// Stats
router.get('/stats', aiController.getAIStats);

module.exports = router;















