const { Router } = require('express');
const { handleWebhook, upsertStore, listEvents } = require('../controllers/salla.controller');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// Public webhook endpoint with optional user_id path
router.post('/webhook/:user_id?', handleWebhook);

// Authenticated endpoints to manage and view
router.post('/store', requireAuth, upsertStore);
router.get('/events', requireAuth, listEvents);

module.exports = router;


