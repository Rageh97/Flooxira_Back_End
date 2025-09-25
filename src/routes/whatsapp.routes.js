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
router.get('/groups/export', whatsappCtrl.exportGroupMembers);
router.post('/status/post', upload.single('image'), whatsappCtrl.postStatus);

// Campaigns
router.post('/campaigns/start', upload.single('file'), whatsappCtrl.startCampaign);

// Knowledge base for WhatsApp Web
router.post('/knowledge/upload', whatsappCtrl.upload.single('file'), whatsappCtrl.uploadKnowledgeBase);
router.get('/knowledge', whatsappCtrl.getKnowledgeBase);
router.delete('/knowledge/:id', whatsappCtrl.deleteKnowledgeEntry);

module.exports = router;




