const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/tutorial.controller');

const router = Router();

// Public routes
router.get('/', ctrl.getAllTutorials);
router.post('/:id/view', ctrl.incrementViews);

// Protected routes
router.use(requireAuth);

// Admin routes
router.get('/admin', ctrl.getAllTutorialsAdmin);
router.post('/admin', ctrl.createTutorial);
router.put('/admin/:id', ctrl.updateTutorial);
router.delete('/admin/:id', ctrl.deleteTutorial);

module.exports = router;













