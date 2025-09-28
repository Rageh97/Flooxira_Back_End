const { Router } = require('express');
const { checkConnections } = require('../controllers/platforms.controller');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// All platform routes require authentication
router.use(requireAuth);

router.get('/connections', checkConnections);

module.exports = router;