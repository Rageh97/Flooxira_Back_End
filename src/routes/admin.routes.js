const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

const router = Router();

// Per-number management: scope to authenticated user's WhatsApp data
router.use(requireAuth);

router.get('/agents', ctrl.listAgents);
router.get('/chats', ctrl.listChats);
router.post('/chats/assign', ctrl.assignChat);

module.exports = router;


