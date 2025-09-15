const { Router } = require('express');
const { requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/plans.controller');

const router = Router();

// Public view of active plans
router.get('/public', ctrl.publicPlans);

// Admin-only management
router.use(requireAdmin);
router.get('/', ctrl.listPlans);
router.post('/', ctrl.createPlan);
router.put('/:id', ctrl.updatePlan);
router.delete('/:id', ctrl.deletePlan);

module.exports = router;


