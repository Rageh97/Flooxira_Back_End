const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/whatsapp.business.controller');
const { exchangeMetaCode } = require('../web/whatsapp.oauth');

const router = Router();

router.use(requireAuth);

// Configure WABA creds (phoneNumberId, token, optional verify token)
router.post('/configure', ctrl.configure);
// Status of configuration
router.get('/status', ctrl.status);
// Send message (simple text for now)
router.post('/send', ctrl.sendMessage);
// Knowledge base
router.post('/knowledge/upload', ctrl.upload.single('file'), ctrl.uploadKnowledgeBase);
router.get('/knowledge', ctrl.getKnowledgeBase);
router.delete('/knowledge/:id', ctrl.deleteKnowledgeEntry);

// OAuth code exchange (after /auth/whatsapp callback redirects with code)
router.post('/exchange', requireAuth, exchangeMetaCode);

// Webhooks (do not require auth)
router.get('/webhook', ctrl.webhookVerify);
router.post('/webhook', ctrl.webhookReceive);

module.exports = router;




