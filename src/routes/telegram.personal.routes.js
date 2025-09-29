const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/telegram.personal.controller');

const router = Router();
router.use(requireAuth);

router.post('/start', ctrl.start);
router.get('/status', ctrl.status);
router.get('/qr', ctrl.qr);
router.post('/stop', ctrl.stop);
router.post('/send', ctrl.send);
router.get('/chats', ctrl.chats);
router.get('/contacts', ctrl.contacts);
router.get('/stats', ctrl.stats);
router.get('/groups', ctrl.groups);

module.exports = router;

