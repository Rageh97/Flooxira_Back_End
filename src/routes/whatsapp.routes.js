const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const whatsappCtrl = require('../controllers/whatsapp.controller');
const multer = require('multer');
const upload = multer({ dest: 'uploads/tmp' });

const router = Router();

router.use(requireAuth);

// WhatsApp Web Routes
router.post('/start', whatsappCtrl.startWhatsAppSession);
router.get('/status', whatsappCtrl.getWhatsAppStatus);
router.get('/qr', whatsappCtrl.getQRCode);
router.post('/stop', whatsappCtrl.stopWhatsAppSession);
router.post('/send', whatsappCtrl.sendWhatsAppMessage);

// Chat Management Routes
router.get('/chats', whatsappCtrl.getChatHistory);
router.get('/contacts', whatsappCtrl.getChatContacts);
router.get('/stats', whatsappCtrl.getBotStats);

// Groups & Status
router.get('/groups', whatsappCtrl.listGroups);
router.post('/groups/send', whatsappCtrl.sendToGroup);
// Bulk group send with media + scheduling
router.post('/groups/send-bulk', upload.single('media'), whatsappCtrl.sendToGroupsBulk);
router.get('/schedules', whatsappCtrl.listSchedules);
router.post('/schedules/:id/cancel', whatsappCtrl.cancelSchedule);
router.put('/schedules/:id', whatsappCtrl.updateSchedule);
router.delete('/schedules/:id', whatsappCtrl.deleteSchedule);
router.get('/schedules/monthly', whatsappCtrl.listMonthlySchedules);
router.put('/schedules/post/:id', whatsappCtrl.updateScheduledPost);
router.delete('/schedules/post/:id', whatsappCtrl.deleteScheduledPost);
router.get('/groups/export', whatsappCtrl.exportGroupMembers);
router.post('/status/post', upload.single('image'), whatsappCtrl.postStatus);

// Campaigns (accept Excel file and optional media)
router.post('/campaigns/start', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'media', maxCount: 1 }]), whatsappCtrl.startCampaign);

// Knowledge base for WhatsApp Web
router.post('/knowledge/upload', whatsappCtrl.upload.single('file'), whatsappCtrl.uploadKnowledgeBase);
router.get('/knowledge', whatsappCtrl.getKnowledgeBase);
router.delete('/knowledge/:id', whatsappCtrl.deleteKnowledgeEntry);

module.exports = router;




