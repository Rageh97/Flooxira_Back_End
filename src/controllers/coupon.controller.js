const { Coupon } = require('../models/coupon');
const { Plan } = require('../models/plan');

// Create coupon
async function createCoupon(req, res) {
  try {
    const { code, planId, expiresAt, notes } = req.body;
    
    if (!code || !planId) {
      return res.status(400).json({ message: 'Coupon code and plan ID are required' });
    }

    // Verify plan exists
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      return res.status(400).json({ message: 'Invalid plan ID' });
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({
      where: { code: code }
    });

    if (existingCoupon) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const coupon = await Coupon.create({
      code: code,
      planId: planId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      notes: notes
    });

    return res.status(201).json({ 
      success: true, 
      coupon,
      message: 'Coupon created successfully' 
    });
  } catch (error) {
    console.error('Create coupon error:', error);
    return res.status(500).json({ message: 'Failed to create coupon' });
  }
}

// List all coupons
async function listCoupons(req, res) {
  try {
    const { planId, isActive, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (planId) {
      whereClause.planId = planId;
    }
    if (isActive !== undefined) {
      whereClause.isActive = isActive === 'true';
    }

    const coupons = await Coupon.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'priceCents', 'interval']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.json({ 
      success: true, 
      coupons: coupons.rows,
      total: coupons.count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('List coupons error:', error);
    return res.status(500).json({ message: 'Failed to get coupons' });
  }
}

// Update coupon
async function updateCoupon(req, res) {
  try {
    const { couponId } = req.params;
    const { isActive, expiresAt, notes } = req.body;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    if (isActive !== undefined) coupon.isActive = isActive;
    if (expiresAt !== undefined) coupon.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (notes !== undefined) coupon.notes = notes;

    await coupon.save();

    return res.json({ 
      success: true, 
      coupon,
      message: 'Coupon updated successfully' 
    });
  } catch (error) {
    console.error('Update coupon error:', error);
    return res.status(500).json({ message: 'Failed to update coupon' });
  }
}

// Delete coupon
async function deleteCoupon(req, res) {
  try {
    const { couponId } = req.params;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    await coupon.destroy();

    return res.json({ 
      success: true, 
      message: 'Coupon deleted successfully' 
    });
  } catch (error) {
    console.error('Delete coupon error:', error);
    return res.status(500).json({ message: 'Failed to delete coupon' });
  }
}

// Generate random coupon codes
async function generateCoupons(req, res) {
  try {
    const { planId, count = 1, prefix = 'COUPON', expiresAt } = req.body;
    
    if (!planId || count < 1 || count > 100) {
      return res.status(400).json({ message: 'Invalid parameters' });
    }

    // Verify plan exists
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      return res.status(400).json({ message: 'Invalid plan ID' });
    }

    const coupons = [];
    const usedCodes = new Set();

    for (let i = 0; i < count; i++) {
      let code;
      let attempts = 0;
      
      do {
        const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        code = `${prefix}_${randomSuffix}`;
        attempts++;
      } while (usedCodes.has(code) && attempts < 10);

      if (attempts >= 10) {
        return res.status(500).json({ message: 'Failed to generate unique coupon codes' });
      }

      usedCodes.add(code);

      const coupon = await Coupon.create({
        code: code,
        planId: planId,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      });

      coupons.push(coupon);
    }

    return res.status(201).json({ 
      success: true, 
      coupons,
      message: `${count} coupons generated successfully` 
    });
  } catch (error) {
    console.error('Generate coupons error:', error);
    return res.status(500).json({ message: 'Failed to generate coupons' });
  }
}

module.exports = {
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
  generateCoupons
};
