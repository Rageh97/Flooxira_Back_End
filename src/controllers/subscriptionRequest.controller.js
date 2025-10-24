const { SubscriptionRequest } = require('../models/subscriptionRequest');
const { Coupon } = require('../models/coupon');
const { UserSubscription } = require('../models/userSubscription');
const { Plan } = require('../models/plan');
const { User } = require('../models/user');

// Create subscription request
async function createSubscriptionRequest(req, res) {
  try {
    const { planId, paymentMethod, usdtWalletAddress, couponCode } = req.body;
    
    if (!planId || !paymentMethod) {
      return res.status(400).json({ message: 'Plan ID and payment method are required' });
    }

    // Verify plan exists
    const plan = await Plan.findByPk(planId);
    if (!plan || !plan.isActive) {
      return res.status(400).json({ message: 'Invalid or inactive plan' });
    }

    // Check if user already has an active subscription for this plan
    const existingSubscription = await UserSubscription.findOne({
      where: {
        userId: req.user.id,
        planId: planId,
        status: 'active'
      }
    });

    if (existingSubscription) {
      return res.status(400).json({ message: 'You already have an active subscription for this plan' });
    }

    // Validate payment method specific data
    if (paymentMethod === 'usdt' && !usdtWalletAddress) {
      return res.status(400).json({ message: 'USDT wallet address is required' });
    }

    if (paymentMethod === 'coupon' && !couponCode) {
      return res.status(400).json({ message: 'Coupon code is required' });
    }

    // If coupon payment, validate coupon
    if (paymentMethod === 'coupon') {
      const coupon = await Coupon.findOne({
        where: {
          code: couponCode,
          planId: planId,
          isActive: true
        }
      });

      if (!coupon) {
        return res.status(400).json({ message: 'Invalid or expired coupon code' });
      }

      if (coupon.expiresAt && new Date() > coupon.expiresAt) {
        return res.status(400).json({ message: 'Coupon has expired' });
      }

      // Check if coupon has reached max uses
      if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
        return res.status(400).json({ message: 'Coupon has reached maximum number of uses' });
      }
    }

    const subscriptionRequest = await SubscriptionRequest.create({
      userId: req.user.id,
      planId: planId,
      paymentMethod: paymentMethod,
      usdtWalletAddress: paymentMethod === 'usdt' ? usdtWalletAddress : null,
      couponCode: paymentMethod === 'coupon' ? couponCode : null,
      status: 'pending'
    });

    return res.status(201).json({ 
      success: true, 
      subscriptionRequest,
      message: 'Subscription request created successfully' 
    });
  } catch (error) {
    console.error('Create subscription request error:', error);
    return res.status(500).json({ message: 'Failed to create subscription request' });
  }
}

// Upload receipt for USDT payment
async function uploadReceipt(req, res) {
  try {
    const { requestId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: 'Receipt image is required' });
    }

    const subscriptionRequest = await SubscriptionRequest.findOne({
      where: {
        id: requestId,
        userId: req.user.id,
        paymentMethod: 'usdt',
        status: 'pending'
      }
    });

    if (!subscriptionRequest) {
      return res.status(404).json({ message: 'Subscription request not found' });
    }

    subscriptionRequest.receiptImage = req.file.filename;
    await subscriptionRequest.save();

    return res.json({ 
      success: true, 
      message: 'Receipt uploaded successfully',
      receiptImage: req.file.filename
    });
  } catch (error) {
    console.error('Upload receipt error:', error);
    return res.status(500).json({ message: 'Failed to upload receipt' });
  }
}

// Get user's subscription requests
async function getUserSubscriptionRequests(req, res) {
  try {
    const requests = await SubscriptionRequest.findAll({
      where: { userId: req.user.id },
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'priceCents', 'interval']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return res.json({ success: true, requests });
  } catch (error) {
    console.error('Get user subscription requests error:', error);
    return res.status(500).json({ message: 'Failed to get subscription requests' });
  }
}

// Admin: Get all subscription requests
async function getAllSubscriptionRequests(req, res) {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    const requests = await SubscriptionRequest.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'priceCents', 'interval']
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    return res.json({ 
      success: true, 
      requests: requests.rows,
      total: requests.count,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Get all subscription requests error:', error);
    return res.status(500).json({ message: 'Failed to get subscription requests' });
  }
}

// Admin: Update subscription request status
async function updateSubscriptionRequestStatus(req, res) {
  try {
    const { requestId } = req.params;
    const { status, adminNotes } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const subscriptionRequest = await SubscriptionRequest.findByPk(requestId, {
      include: [
        {
          model: Plan,
          attributes: ['id', 'name', 'priceCents', 'interval']
        },
        {
          model: User,
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!subscriptionRequest) {
      return res.status(404).json({ message: 'Subscription request not found' });
    }

    subscriptionRequest.status = status;
    subscriptionRequest.adminNotes = adminNotes;
    subscriptionRequest.processedAt = new Date();
    subscriptionRequest.processedBy = req.user.id;

    await subscriptionRequest.save();

    // If approved, create user subscription
    if (status === 'approved') {
      // Calculate expiration date
      const plan = subscriptionRequest.Plan;
      let expiresAt = new Date();
      
      if (plan.interval === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else if (plan.interval === 'yearly') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      // If coupon was used, apply bonusDays
      let coupon = null;
      if (subscriptionRequest.paymentMethod === 'coupon' && subscriptionRequest.couponCode) {
        coupon = await Coupon.findOne({
          where: { code: subscriptionRequest.couponCode }
        });

        if (coupon && coupon.bonusDays > 0) {
          expiresAt.setDate(expiresAt.getDate() + coupon.bonusDays);
        }
      }

      await UserSubscription.create({
        userId: subscriptionRequest.userId,
        planId: subscriptionRequest.planId,
        subscriptionRequestId: subscriptionRequest.id,
        status: 'active',
        startedAt: new Date(),
        expiresAt: expiresAt
      });

      // If coupon was used, increment currentUses
      if (coupon) {
        await Coupon.update(
          { 
            currentUses: (coupon.currentUses || 0) + 1,
            usedAt: new Date(), // Keep for backward compatibility
            usedBy: subscriptionRequest.userId // Keep for backward compatibility
          },
          { 
            where: { code: subscriptionRequest.couponCode }
          }
        );
      }
    }

    return res.json({ 
      success: true, 
      message: 'Subscription request status updated successfully',
      subscriptionRequest
    });
  } catch (error) {
    console.error('Update subscription request status error:', error);
    return res.status(500).json({ message: 'Failed to update subscription request status' });
  }
}

// Validate coupon code
async function validateCoupon(req, res) {
  try {
    const { code, planId, discountKeyword } = req.query;
    const userId = req.user?.id;

    if (!code || !planId) {
      return res.status(400).json({ message: 'Coupon code and plan ID are required' });
    }

    const coupon = await Coupon.findOne({
      where: {
        code: code,
        planId: planId,
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
      return res.status(400).json({ message: 'كود القسيمة غير صحيح' });
    }

    if (coupon.expiresAt && new Date() > coupon.expiresAt) {
      return res.status(400).json({ message: 'انتهت صلاحية القسيمة' });
    }

    // Check if coupon has reached max uses
    if (coupon.maxUses && coupon.currentUses >= coupon.maxUses) {
      return res.status(400).json({ message: 'تم استخدام هذه القسيمة الحد الأقصى من المرات' });
    }

    // If user is authenticated, activate the coupon/discount immediately
    if (userId) {
      // Check if user already has an active subscription for this plan
      const existingSubscription = await UserSubscription.findOne({
        where: {
          userId: userId,
          planId: planId,
          status: 'active',
          expiresAt: {
            [require('sequelize').Op.gt]: new Date()
          }
        }
      });

      if (existingSubscription) {
        return res.status(400).json({ message: 'لديك بالفعل اشتراك نشط في هذه الباقة' });
      }

      // Calculate expiration date based on plan interval
      let expiresAt = new Date();
      if (coupon.plan.interval === 'monthly') {
        expiresAt.setMonth(expiresAt.getMonth() + 1);
      } else if (coupon.plan.interval === 'yearly') {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      }

      // Apply bonus days only if coupon type is bonus_days
      if (coupon.discountType === 'bonus_days' && coupon.bonusDays && coupon.bonusDays > 0) {
        expiresAt.setDate(expiresAt.getDate() + coupon.bonusDays);
      }

      // Calculate final price after discount
      let finalPriceCents = coupon.plan.priceCents;
      let appliedDiscount = 0;
      
      // Apply base discount
      if (coupon.discountType === 'percentage' && coupon.discountValue > 0) {
        appliedDiscount = coupon.discountValue;
        finalPriceCents = Math.round(coupon.plan.priceCents * (1 - coupon.discountValue / 100));
      } else if (coupon.discountType === 'fixed' && coupon.discountValue > 0) {
        appliedDiscount = coupon.discountValue;
        finalPriceCents = Math.max(0, coupon.plan.priceCents - (coupon.discountValue * 100));
      }
      
      // Apply additional discount keyword if provided and matches
      if (discountKeyword && coupon.discountKeyword && 
          discountKeyword.toLowerCase() === coupon.discountKeyword.toLowerCase() && 
          coupon.discountKeywordValue > 0) {
        if (coupon.discountType === 'percentage') {
          // Apply additional percentage discount
          const additionalDiscount = coupon.discountKeywordValue;
          finalPriceCents = Math.round(finalPriceCents * (1 - additionalDiscount / 100));
          appliedDiscount += additionalDiscount;
        } else if (coupon.discountType === 'fixed') {
          // Apply additional fixed discount
          const additionalDiscount = coupon.discountKeywordValue * 100; // Convert to cents
          finalPriceCents = Math.max(0, finalPriceCents - additionalDiscount);
          appliedDiscount += coupon.discountKeywordValue;
        }
      }

      // Create user subscription
      const subscription = await UserSubscription.create({
        userId: userId,
        planId: planId,
        status: 'active',
        startedAt: new Date(),
        expiresAt: expiresAt,
        couponCode: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        finalPriceCents: finalPriceCents
      });

      // Increment coupon uses
      await Coupon.update(
        { 
          currentUses: (coupon.currentUses || 0) + 1,
          usedAt: new Date(), // Keep for backward compatibility
          usedBy: userId // Keep for backward compatibility
        },
        { 
          where: { id: coupon.id }
        }
      );

      return res.json({ 
        success: true, 
        valid: true,
        activated: true,
        subscription: subscription,
        coupon: {
          id: coupon.id,
          code: coupon.code,
          plan: coupon.plan
        }
      });
    }

    // If no user authentication, just validate
    return res.json({ 
      success: true, 
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        plan: coupon.plan
      }
    });
  } catch (error) {
    console.error('Validate coupon error:', error);
    return res.status(500).json({ message: 'Failed to validate coupon' });
  }
}

// Get user's current subscription
async function getUserSubscription(req, res) {
  try {
    const userId = req.user.id;
    
    const subscription = await UserSubscription.findOne({
      where: {
        userId: userId,
        status: 'active',
        expiresAt: {
          [require('sequelize').Op.gt]: new Date()
        }
      },
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'permissions']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (!subscription) {
      return res.json({ 
        success: true, 
        subscription: null,
        message: 'لا يوجد اشتراك نشط'
      });
    }

    return res.json({ 
      success: true, 
      subscription: subscription
    });
  } catch (error) {
    console.error('Get user subscription error:', error);
    return res.status(500).json({ message: 'Failed to get user subscription' });
  }
}

// Get USDT wallet information
async function getUSDTWalletInfo(req, res) {
  try {
    // This would typically come from environment variables or database
    const walletInfo = {
      address: process.env.USDT_WALLET_ADDRESS || 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
      network: 'TRC20',
      instructions: 'يرجى إرسال المبلغ المحدد إلى عنوان المحفظة أعلاه ورفع إيصال المعاملة.'
    };

    return res.json({ success: true, walletInfo });
  } catch (error) {
    console.error('Get USDT wallet info error:', error);
    return res.status(500).json({ message: 'Failed to get wallet information' });
  }
}

module.exports = {
  createSubscriptionRequest,
  uploadReceipt,
  getUserSubscriptionRequests,
  getAllSubscriptionRequests,
  updateSubscriptionRequestStatus,
  validateCoupon,
  getUserSubscription,
  getUSDTWalletInfo
};
