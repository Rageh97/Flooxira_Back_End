const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/permissions');
const ctrl = require('../controllers/review.controller');

const router = Router();

// Public routes
router.get('/', ctrl.getAllReviews);
router.get('/stats', ctrl.getReviewStats);

// Protected routes
router.use(requireAuth);

// User routes
router.post('/', ctrl.createReview);

// Admin routes
router.get('/admin', requireAdmin, ctrl.getAllReviewsAdmin);
router.put('/admin/:id/status', requireAdmin, ctrl.updateReviewStatus);
router.delete('/admin/:id', requireAdmin, ctrl.deleteReview);

module.exports = router;













