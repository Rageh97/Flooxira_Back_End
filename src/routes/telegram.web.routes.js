const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/telegram.web.controller');

const router = Router();
router.use(requireAuth);

router.post('/start', ctrl.start);
router.get('/status', ctrl.status);
router.get('/qr', ctrl.qr);
router.post('/stop', ctrl.stop);
router.post('/send', ctrl.send);
router.get('/groups', ctrl.groups);
router.post('/send-bulk', ctrl.sendBulk);

module.exports = router;

