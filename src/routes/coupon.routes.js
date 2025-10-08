const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
  generateCoupons
} = require('../controllers/coupon.controller');

// Admin routes for coupon management
router.post('/', requireAuth, createCoupon);
router.get('/', requireAuth, listCoupons);
router.put('/:couponId', requireAuth, updateCoupon);
router.delete('/:couponId', requireAuth, deleteCoupon);
router.post('/generate', requireAuth, generateCoupons);

module.exports = router;
