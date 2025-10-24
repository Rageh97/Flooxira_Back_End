const { Router } = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/plans.controller');

const router = Router();

// Public view of active plans (no auth required)
router.get('/public', ctrl.publicPlans);

// List all plans - requires authentication (users can see all active plans)
router.get('/', requireAuth, ctrl.listPlans);

// Admin-only management
router.post('/', requireAdmin, ctrl.createPlan);
router.put('/:id', requireAdmin, ctrl.updatePlan);
router.delete('/:id', requireAdmin, ctrl.deletePlan);

module.exports = router;


