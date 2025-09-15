const { Router } = require('express');
const ctrl = require('../controllers/auth.controller');

const router = Router();

router.post('/sign-up', ctrl.signUp);
router.post('/sign-in', ctrl.signIn);
router.get('/me', ctrl.me);
router.post('/forgot', ctrl.requestPasswordReset);
router.post('/reset', ctrl.resetPassword);

module.exports = router;









