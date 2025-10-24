const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/usage.controller');

const router = Router();
router.use(requireAuth);

router.get('/stats', ctrl.getUsageStats);
router.get('/stats/all', ctrl.getAllUsageStats);

module.exports = router;




