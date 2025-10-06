const { Router } = require('express');
const { checkConnections } = require('../controllers/platforms.controller');
const creds = require('../controllers/platformCredentials.controller');
const { requireAuth } = require('../middleware/auth');

const router = Router();

// All platform routes require authentication
router.use(requireAuth);

router.get('/connections', checkConnections);
router.get('/credentials', creds.listCredentials);
router.get('/credentials/:platform', creds.getCredential);
router.put('/credentials/:platform', creds.upsertCredential);
router.delete('/credentials/:platform', creds.deleteCredential);

module.exports = router;