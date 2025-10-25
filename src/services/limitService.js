const { User } = require('../models/user');
const { UserSubscription } = require('../models/userSubscription');
const { Plan } = require('../models/plan');
const { MessageUsage } = require('../models/messageUsage');
const { Op } = require('sequelize');

class LimitService {
  constructor() {
    this.userLimits = new Map(); // Cache for user limits
    this.userUsage = new Map(); // Cache for user usage
  }

  // Get user's current plan and limits
  async getUserLimits(userId) {
    try {
      // Check cache first
      if (this.userLimits.has(userId)) {
        const cached = this.userLimits.get(userId);
        // Cache for 5 minutes
        if (Date.now() - cached.timestamp < 5 * 60 * 1000) {
          return cached.data;
        }
      }

      const subscription = await UserSubscription.findOne({
        where: { 
          userId, 
          status: 'active',
          expiresAt: { [Op.gt]: new Date() }
        },
        include: [{
          model: Plan,
          as: 'plan'
        }]
      });

      if (!subscription || !subscription.plan) {
        return {
          canManageWhatsApp: false,
          canManageTelegram: false,
          whatsappMessagesPerMonth: 0,
          telegramMessagesPerMonth: 0,
          planName: 'No Plan'
        };
      }

      const limits = {
        canManageWhatsApp: subscription.plan.permissions?.canManageWhatsApp || false,
        canManageTelegram: subscription.plan.permissions?.canManageTelegram || false,
        whatsappMessagesPerMonth: subscription.plan.permissions?.whatsappMessagesPerMonth || 0,
        telegramMessagesPerMonth: subscription.plan.permissions?.telegramMessagesPerMonth || 0,
        planName: subscription.plan.name,
        expiresAt: subscription.expiresAt
      };

      // Cache the result
      this.userLimits.set(userId, {
        data: limits,
        timestamp: Date.now()
      });

      return limits;
    } catch (error) {
      console.error('Error getting user limits:', error);
      return {
        canManageWhatsApp: false,
        canManageTelegram: false,
        whatsappMessagesPerMonth: 0,
        telegramMessagesPerMonth: 0,
        planName: 'Error'
      };
    }
  }

  // Get user's current usage for a platform
  async getUserUsage(userId, platform, month = null, year = null) {
    try {
      const now = new Date();
      const currentMonth = month || now.getMonth() + 1;
      const currentYear = year || now.getFullYear();

      const cacheKey = `${userId}_${platform}_${currentMonth}_${currentYear}`;
      
      // Check cache first
      if (this.userUsage.has(cacheKey)) {
        const cached = this.userUsage.get(cacheKey);
        // Cache for 1 minute
        if (Date.now() - cached.timestamp < 60 * 1000) {
          return cached.data;
        }
      }

      const usage = await MessageUsage.findOne({
        where: {
          userId,
          platform,
          month: currentMonth,
          year: currentYear
        }
      });

      const totalUsage = usage ? usage.count : 0;

      // Cache the result
      this.userUsage.set(cacheKey, {
        data: totalUsage,
        timestamp: Date.now()
      });

      return totalUsage;
    } catch (error) {
      console.error('Error getting user usage:', error);
      return 0;
    }
  }

  // Check if user can send message
  async canSendMessage(userId, platform) {
    try {
      const limits = await this.getUserLimits(userId);
      const usage = await this.getUserUsage(userId, platform);

      if (platform === 'whatsapp') {
        if (!limits.canManageWhatsApp) {
          return { canSend: false, reason: 'WhatsApp management not allowed in your plan' };
        }
        if (usage >= limits.whatsappMessagesPerMonth) {
          return { canSend: false, reason: 'Monthly WhatsApp message limit reached' };
        }
      } else if (platform === 'telegram') {
        if (!limits.canManageTelegram) {
          return { canSend: false, reason: 'Telegram management not allowed in your plan' };
        }
        if (usage >= limits.telegramMessagesPerMonth) {
          return { canSend: false, reason: 'Monthly Telegram message limit reached' };
        }
      }

      return { canSend: true };
    } catch (error) {
      console.error('Error checking message limit:', error);
      return { canSend: false, reason: 'Error checking limits' };
    }
  }

  // Record message usage
  async recordMessageUsage(userId, platform, messageType = 'outgoing', count = 1, metadata = {}) {
    try {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      // Find existing usage record
      let usage = await MessageUsage.findOne({
        where: {
          userId,
          platform,
          month,
          year
        }
      });

      if (usage) {
        // Update existing record
        usage.count += count;
        await usage.save();
      } else {
        // Create new record
        usage = await MessageUsage.create({
          userId,
          platform,
          messageType,
          count,
          month,
          year,
          metadata
        });
      }

      // Clear cache
      const cacheKey = `${userId}_${platform}_${month}_${year}`;
      this.userUsage.delete(cacheKey);

      return usage;
    } catch (error) {
      console.error('Error recording message usage:', error);
    }
  }

  // Get usage statistics
  async getUsageStats(userId, platform) {
    try {
      const limits = await this.getUserLimits(userId);
      const usage = await this.getUserUsage(userId, platform);

      const limit = platform === 'whatsapp' ? limits.whatsappMessagesPerMonth : limits.telegramMessagesPerMonth;
      const percentage = limit > 0 ? (usage / limit) * 100 : 0;
      const remaining = Math.max(0, limit - usage);

      return {
        used: usage,
        limit: limit,
        remaining: remaining,
        percentage: Math.round(percentage),
        isNearLimit: percentage >= 80,
        isAtLimit: percentage >= 100,
        canSend: usage < limit
      };
    } catch (error) {
      console.error('Error getting usage stats:', error);
      return {
        used: 0,
        limit: 0,
        remaining: 0,
        percentage: 0,
        isNearLimit: false,
        isAtLimit: true,
        canSend: false
      };
    }
  }

  // Clear cache for user
  clearUserCache(userId) {
    // Clear limits cache
    for (const [key, value] of this.userLimits.entries()) {
      if (key === userId) {
        this.userLimits.delete(key);
      }
    }

    // Clear usage cache
    for (const [key, value] of this.userUsage.entries()) {
      if (key.startsWith(`${userId}_`)) {
        this.userUsage.delete(key);
      }
    }
  }
}

module.exports = new LimitService();




