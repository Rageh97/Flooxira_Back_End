const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { 
  requireActiveSubscription, 
  requireContentManagement, 
  requirePlatformAccess,
  checkMonthlyPostsLimit 
} = require('../middleware/permissions');
const ctrl = require('../controllers/posts.controller');

const router = Router();

router.use(requireAuth);
router.use(requireActiveSubscription);
router.use(requireContentManagement);

router.get('/test', (_req, res) => res.json({ ok: true }));
router.get('/', ctrl.listPosts);
router.post('/', checkMonthlyPostsLimit, ctrl.createPost);
router.put('/:id', ctrl.updatePost);
router.delete('/:id', ctrl.deletePost);
router.get('/stats', ctrl.stats);

module.exports = router;


