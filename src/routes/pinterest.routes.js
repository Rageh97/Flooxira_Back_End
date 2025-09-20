const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  getPinterestAccount,
  exchangeCode,
  getBoards,
  createPin,
  getPins,
  testPinterestConnection,
  disconnectPinterest,
  refreshToken
} = require('../controllers/pinterest.controller');

const router = Router();

// All routes require authentication
router.use(requireAuth);

// Exchange OAuth code for access token
router.post('/exchange', exchangeCode);

// Get connected Pinterest account info
router.get('/account', getPinterestAccount);

// Test Pinterest connection
router.get('/test', testPinterestConnection);

// Get Pinterest boards
router.get('/boards', getBoards);

// Get Pinterest pins (optionally filtered by board)
router.get('/pins', getPins);

// Create a new pin
router.post('/pins', createPin);

// Refresh access token
router.post('/refresh-token', refreshToken);

// Disconnect Pinterest account
router.post('/disconnect', disconnectPinterest);

module.exports = router;
