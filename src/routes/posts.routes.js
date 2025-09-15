const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/posts.controller');

const router = Router();

router.use(requireAuth);
router.get('/test', (_req, res) => res.json({ ok: true }));
router.get('/', ctrl.listPosts);
router.post('/', ctrl.createPost);
router.put('/:id', ctrl.updatePost);
router.delete('/:id', ctrl.deletePost);
router.get('/stats', ctrl.stats);

module.exports = router;


