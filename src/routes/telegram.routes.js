const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const telegramCtrl = require('../controllers/telegram.controller');
const multer = require('multer');
const upload = multer({ dest: 'uploads/tmp' });

const router = Router();

router.use(requireAuth);

// Telegram Bot Routes
router.post('/create', telegramCtrl.createTelegramBot);
router.get('/status', telegramCtrl.getTelegramStatus);
router.post('/stop', telegramCtrl.stopTelegramBot);
router.post('/send', telegramCtrl.sendTelegramMessage);
router.get('/info', telegramCtrl.getBotInfo);

// Chat Management Routes
router.get('/chats', telegramCtrl.getChatHistory);
router.get('/contacts', telegramCtrl.getChatContacts);
router.get('/stats', telegramCtrl.getBotStats);

// Groups & Broadcasting
router.get('/groups', telegramCtrl.listGroups);
router.post('/groups/send', telegramCtrl.sendToGroup);
// Bulk group send with media + scheduling
router.post('/groups/send-bulk', upload.single('media'), telegramCtrl.sendToGroupsBulk);
router.get('/schedules', telegramCtrl.listSchedules);
router.post('/schedules/:id/cancel', telegramCtrl.cancelSchedule);
router.put('/schedules/:id', upload.single('media'), telegramCtrl.updateSchedule);
router.delete('/schedules/:id', telegramCtrl.deleteSchedule);
router.get('/schedules/monthly', telegramCtrl.listMonthlySchedules);

// Campaigns (accept Excel file and optional media)
router.post('/campaigns/start', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'media', maxCount: 1 }]), telegramCtrl.startCampaign);

// Knowledge base for Telegram Bot
router.post('/knowledge/upload', telegramCtrl.upload.single('file'), telegramCtrl.uploadKnowledgeBase);
router.get('/knowledge', telegramCtrl.getKnowledgeBase);
router.delete('/knowledge/:id', telegramCtrl.deleteKnowledgeEntry);

module.exports = router;