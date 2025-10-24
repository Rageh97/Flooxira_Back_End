const express = require('express');
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { 
  requireActiveSubscription, 
  requireTelegramManagement 
} = require('../middleware/permissions');
const ctrl = require('../controllers/telegram.bot.controller');

const router = Router();

router.use('/webhook/:userId', express.json({ type: '*/*' }));
router.post('/webhook/:userId', ctrl.webhook);

router.use(requireAuth);
router.use(requireActiveSubscription);
router.use(requireTelegramManagement);
router.post('/connect', ctrl.connect);
router.post('/disconnect', ctrl.disconnectBot);
router.get('/info', ctrl.info);
router.get('/test', ctrl.testBot);
// Removed legacy send endpoint
router.post('/send', ctrl.sendMessage);
router.get('/chat/:chatId', ctrl.getChat);
router.get('/chat/:chatId/admins', ctrl.getChatAdmins);
router.post('/promote', ctrl.promoteMember);
router.get('/updates', ctrl.getUpdates);
router.get('/chats', ctrl.getChatHistory);
router.get('/stats', ctrl.getChatStats);
router.get('/contacts', ctrl.getChatContacts);
router.get('/chat/:chatId/members', ctrl.getChatMembersInfo);
router.post('/poll-messages', ctrl.pollMessages);
router.get('/chat/:chatId/export', ctrl.exportMembers);
router.get('/bot-chats', ctrl.getBotChats);

// Campaigns
router.post('/campaigns', ctrl.createTelegramCampaign);
router.get('/campaigns', ctrl.listTelegramCampaigns);
router.get('/schedules/monthly', ctrl.listTelegramMonthlySchedules);
router.put('/schedules/:id', ctrl.updateTelegramScheduleController);
router.delete('/schedules/:id', ctrl.deleteTelegramScheduleController);

// Template routes
router.post('/send-template', ctrl.sendTemplateMessage);
router.get('/templates', ctrl.getActiveTemplates);
router.post('/find-template', ctrl.findMatchingTemplate);
router.post('/test-template', ctrl.testTemplateMatching);

module.exports = router;

