const { Coupon } = require('../models/coupon');
const { Plan } = require('../models/plan');

// Create coupon
async function createCoupon(req, res) {
  try {
    const { 
      code, 
      customSuffix, 
      planId, 
      discountType, 
      discountValue, 
      bonusDays, 
      expiresAt, 
      maxUses,
      notes,
      discountKeyword,
      discountKeywordValue
    } = req.body;
    
    if (!code || !planId) {
      return res.status(400).json({ message: 'Coupon code and plan ID are required' });
    }

    // Verify plan exists
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      return res.status(400).json({ message: 'Invalid plan ID' });
    }

    // Build final coupon code with custom suffix if provided
    let finalCode = code;
    if (customSuffix) {
      finalCode = `${code}-${customSuffix}`;
    }

    // Check if coupon code already exists
    const existingCoupon = await Coupon.findOne({
      where: { code: finalCode }
    });

    if (existingCoupon) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const coupon = await Coupon.create({
      code: finalCode,
      customSuffix: customSuffix || null,
      planId: planId,
      discountType: discountType || 'percentage',
      discountValue: discountValue || 0,
      bonusDays: bonusDays || 0,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      maxUses: maxUses || null,
      currentUses: 0,
      notes: notes,
      discountKeyword: discountKeyword || null,
      discountKeywordValue: discountKeywordValue || null
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
    const { 
      isActive, 
      expiresAt, 
      notes, 
      discountType, 
      discountValue, 
      bonusDays,
      maxUses
    } = req.body;

    const coupon = await Coupon.findByPk(couponId);
    if (!coupon) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    if (isActive !== undefined) coupon.isActive = isActive;
    if (expiresAt !== undefined) coupon.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (notes !== undefined) coupon.notes = notes;
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = discountValue;
    if (bonusDays !== undefined) coupon.bonusDays = bonusDays;
    if (maxUses !== undefined) coupon.maxUses = maxUses;

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
    const { 
      planId, 
      count = 1, 
      prefix = 'COUPON', 
      customSuffix,
      discountType,
      discountValue,
      bonusDays,
      maxUses,
      expiresAt,
      discountKeyword,
      discountKeywordValue
    } = req.body;
    
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
        if (customSuffix) {
          code = `${code}-${customSuffix}`;
        }
        attempts++;
      } while (usedCodes.has(code) && attempts < 10);

      if (attempts >= 10) {
        return res.status(500).json({ message: 'Failed to generate unique coupon codes' });
      }

      usedCodes.add(code);

      const coupon = await Coupon.create({
        code: code,
        customSuffix: customSuffix || null,
        planId: planId,
        discountType: discountType || 'percentage',
        discountValue: discountValue || 0,
        bonusDays: bonusDays || 0,
        maxUses: maxUses || null,
        currentUses: 0,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        discountKeyword: discountKeyword || null,
        discountKeywordValue: discountKeywordValue || null
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

// Verify discount coupon (without activating it)
async function verifyCoupon(req, res) {
  try {
    const { code, planId, discountKeyword } = req.query;
    
    if (!code || !planId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Coupon code and plan ID are required' 
      });
    }

    const coupon = await Coupon.findOne({
      where: { 
        code: code,
        isActive: true 
      },
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'priceCents', 'interval']
        }
      ]
    });

    if (!coupon) {
      return res.json({ 
        success: false, 
        valid: false,
        message: 'كود الخصم غير صحيح أو غير نشط' 
      });
    }

    // Check if coupon is for the correct plan
    if (coupon.planId !== parseInt(planId)) {
      return res.json({ 
        success: false, 
        valid: false,
        message: 'هذا الكود غير صالح لهذه الباقة' 
      });
    }

    // Check if coupon has expired
    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
      return res.json({ 
        success: false, 
        valid: false,
        message: 'انتهت صلاحية كود الخصم' 
      });
    }

    // Check if coupon has reached max uses
    if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
      return res.json({ 
        success: false, 
        valid: false,
        message: 'تم استخدام هذا الكود الحد الأقصى من المرات' 
      });
    }

    // Check if this is a discount coupon (not a subscription coupon)
    // Discount coupons should have percentage or fixed discount with value > 0
    if (coupon.discountType === 'bonus_days' && parseFloat(coupon.discountValue) === 0) {
      return res.json({ 
        success: false, 
        valid: false,
        message: 'هذه قسيمة اشتراك وليست كود خصم. استخدمها في نموذج "استخدام قسيمة" لتفعيل الباقة مباشرة'
      });
    }

    // Calculate final price with potential keyword discount
    let finalPrice = coupon.plan.priceCents / 100;
    let appliedDiscount = 0;
    
    // Apply base discount
    if (coupon.discountType === 'percentage' && coupon.discountValue > 0) {
      appliedDiscount = coupon.discountValue;
      finalPrice = finalPrice * (1 - coupon.discountValue / 100);
    } else if (coupon.discountType === 'fixed' && coupon.discountValue > 0) {
      appliedDiscount = coupon.discountValue;
      finalPrice = Math.max(0, finalPrice - coupon.discountValue);
    }
    
    // Apply additional discount keyword if provided and matches
    if (discountKeyword && coupon.discountKeyword && 
        discountKeyword.toLowerCase() === coupon.discountKeyword.toLowerCase() && 
        coupon.discountKeywordValue > 0) {
      if (coupon.discountType === 'percentage') {
        // Apply additional percentage discount
        const additionalDiscount = coupon.discountKeywordValue;
        finalPrice = finalPrice * (1 - additionalDiscount / 100);
        appliedDiscount += additionalDiscount;
      } else if (coupon.discountType === 'fixed') {
        // Apply additional fixed discount
        const additionalDiscount = coupon.discountKeywordValue;
        finalPrice = Math.max(0, finalPrice - additionalDiscount);
        appliedDiscount += additionalDiscount;
      }
    }

    // Coupon is valid
    return res.json({ 
      success: true, 
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: parseFloat(coupon.discountValue),
        bonusDays: coupon.bonusDays,
        plan: coupon.plan,
        discountKeyword: coupon.discountKeyword,
        discountKeywordValue: coupon.discountKeywordValue
      },
      finalPrice: finalPrice,
      appliedDiscount: appliedDiscount,
      message: 'كود الخصم صحيح' 
    });
  } catch (error) {
    console.error('Verify coupon error:', error);
    return res.status(500).json({ 
      success: false,
      message: 'حدث خطأ في التحقق من كود الخصم' 
    });
  }
}

module.exports = {
  createCoupon,
  listCoupons,
  updateCoupon,
  deleteCoupon,
  generateCoupons,
  verifyCoupon
};
