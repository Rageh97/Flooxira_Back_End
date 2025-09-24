const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const whatsappCtrl = require('../controllers/whatsapp.controller');

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

// Knowledge base for WhatsApp Web
router.post('/knowledge/upload', whatsappCtrl.upload.single('file'), whatsappCtrl.uploadKnowledgeBase);
router.get('/knowledge', whatsappCtrl.getKnowledgeBase);
router.delete('/knowledge/:id', whatsappCtrl.deleteKnowledgeEntry);

module.exports = router;




