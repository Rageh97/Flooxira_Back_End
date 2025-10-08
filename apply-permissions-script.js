// Script to apply permissions to all platform routes
// This is a reference for manual updates

const platformRoutes = [
  { file: 'linkedin.routes.js', platform: 'linkedin' },
  { file: 'pinterest.routes.js', platform: 'pinterest' },
  { file: 'tiktok.routes.js', platform: 'tiktok' },
  { file: 'youtube.routes.js', platform: 'youtube' }
];

// For each platform route, add:
// 1. Import permissions middleware
// 2. Apply requireActiveSubscription
// 3. Apply requirePlatformAccess(platform)

// Example for linkedin.routes.js:
/*
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { 
  requireActiveSubscription, 
  requirePlatformAccess 
} = require('../middleware/permissions');
const controller = require('../controllers/linkedin.controller');

const router = Router();

// Apply to all routes:
router.use(requireAuth);
router.use(requireActiveSubscription);
router.use(requirePlatformAccess('linkedin'));
*/













