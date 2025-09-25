const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

const router = Router();

router.use(requireAdmin);

router.get('/agents', ctrl.listAgents);
router.get('/chats', ctrl.listChats);
router.post('/chats/assign', ctrl.assignChat);

module.exports = router;


