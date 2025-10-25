const { UserSubscription } = require('../models/userSubscription');
const { SubscriptionRequest } = require('../models/subscriptionRequest');
const { Plan } = require('../models/plan');
const { User } = require('../models/user');
const { Post } = require('../models/post');
const { WhatsappChat } = require('../models/whatsappChat');
const TelegramChat = require('../models/telegramChat'); // No destructuring - exported directly
const { MessageUsage } = require('../models/messageUsage');
const { Op, fn, col, literal } = require('sequelize');
const { sequelize } = require('../sequelize');
const limitService = require('../services/limitService');

// Get user's billing analytics
async function getBillingAnalytics(req, res) {
  try {
    const userId = req.userId;
    const { period = 'month' } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate, endDate;
    
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
    }

    // Get user's current subscription
    const currentSubscription = await UserSubscription.findOne({
      where: {
        userId: userId,
        status: 'active',
        expiresAt: { [Op.gt]: now }
      },
      include: [{ model: Plan, as: 'plan' }]
    });

    // Get subscription history
    const subscriptionHistory = await UserSubscription.findAll({
      where: { userId: userId },
      include: [{ model: Plan, as: 'plan' }],
      order: [['createdAt', 'DESC']]
    });

    // Calculate total revenue (from all subscriptions)
    const totalRevenue = subscriptionHistory.reduce((sum, sub) => {
      return sum + (sub.plan ? sub.plan.priceCents : 0);
    }, 0);

    // Calculate monthly revenue
    const monthlyRevenue = subscriptionHistory
      .filter(sub => {
        const subDate = new Date(sub.createdAt);
        return subDate >= startDate && subDate <= endDate;
      })
      .reduce((sum, sub) => sum + (sub.plan ? sub.plan.priceCents : 0), 0);

    // Get user limits and usage from limitService
    const limits = await limitService.getUserLimits(userId);
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
    console.log(`[Billing] User ${userId} limits:`, limits);
    
    const [whatsappUsage, telegramUsage] = await Promise.all([
      limitService.getUserUsage(userId, 'whatsapp', currentMonth, currentYear),
      limitService.getUserUsage(userId, 'telegram', currentMonth, currentYear)
    ]);
    
    console.log(`[Billing] WhatsApp usage for ${userId}: ${whatsappUsage}/${limits.whatsappMessagesPerMonth}`);
    console.log(`[Billing] Telegram usage for ${userId}: ${telegramUsage}/${limits.telegramMessagesPerMonth}`);

    // Get platform usage statistics
    const [postsStats, whatsappStats, telegramStats] = await Promise.all([
      // Posts statistics
      Post.findAll({
        where: { userId: userId },
        attributes: [
          [fn('COUNT', col('id')), 'totalPosts'],
          [fn('COUNT', literal('CASE WHEN status = "published" THEN 1 END')), 'publishedPosts'],
          [fn('COUNT', literal('CASE WHEN status = "scheduled" THEN 1 END')), 'scheduledPosts'],
          [fn('COUNT', literal('CASE WHEN status = "draft" THEN 1 END')), 'draftPosts'],
          [fn('COUNT', literal('CASE WHEN status = "failed" THEN 1 END')), 'failedPosts']
        ],
        raw: true
      }),
      
      // WhatsApp statistics - Only count bot responses for billing
      MessageUsage.findAll({
        where: { 
          userId: userId,
          platform: 'whatsapp',
          messageType: 'bot_response'
        },
        attributes: [
          [fn('SUM', col('count')), 'botResponses']
        ],
        raw: true
      }),
      
      // Telegram statistics - Only count bot responses for billing
      MessageUsage.findAll({
        where: { 
          userId: userId,
          platform: 'telegram',
          messageType: 'bot_response'
        },
        attributes: [
          [fn('SUM', col('count')), 'botResponses']
        ],
        raw: true
      })
    ]);

    // Calculate growth rate (simplified)
    const previousPeriodStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    const previousPeriodRevenue = subscriptionHistory
      .filter(sub => {
        const subDate = new Date(sub.createdAt);
        return subDate >= previousPeriodStart && subDate < startDate;
      })
      .reduce((sum, sub) => sum + (sub.plan ? sub.plan.priceCents : 0), 0);

    const growthRate = previousPeriodRevenue > 0 
      ? ((monthlyRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 
      : 0;

    // Calculate conversion rate (simplified - based on subscription requests)
    const totalRequests = await SubscriptionRequest.count({ where: { userId: userId } });
    const approvedRequests = await SubscriptionRequest.count({ 
      where: { userId: userId, status: 'approved' } 
    });
    const conversionRate = totalRequests > 0 ? (approvedRequests / totalRequests) * 100 : 0;

    // Calculate churn rate (simplified)
    const expiredSubscriptions = await UserSubscription.count({
      where: {
        userId: userId,
        status: 'expired',
        expiresAt: { [Op.gte]: startDate, [Op.lte]: endDate }
      }
    });
    const totalActiveSubscriptions = await UserSubscription.count({
      where: { userId: userId, status: 'active' }
    });
    const churnRate = totalActiveSubscriptions > 0 ? (expiredSubscriptions / totalActiveSubscriptions) * 100 : 0;

    // Calculate average revenue per user (ARPU)
    const averageRevenuePerUser = subscriptionHistory.length > 0 
      ? totalRevenue / subscriptionHistory.length 
      : 0;

    return res.json({
      success: true,
      data: {
        totalRevenue: totalRevenue / 100, // Convert from cents
        monthlyRevenue: monthlyRevenue / 100,
        activeUsers: 1, // Current user
        messagesSent: (whatsappStats[0]?.botResponses || 0) + (telegramStats[0]?.botResponses || 0),
        growthRate: Math.round(growthRate * 100) / 100,
        conversionRate: Math.round(conversionRate * 100) / 100,
        churnRate: Math.round(churnRate * 100) / 100,
        averageRevenuePerUser: Math.round(averageRevenuePerUser * 100) / 100,
        postsStats: {
          total: parseInt(postsStats[0]?.totalPosts) || 0,
          published: parseInt(postsStats[0]?.publishedPosts) || 0,
          scheduled: parseInt(postsStats[0]?.scheduledPosts) || 0,
          draft: parseInt(postsStats[0]?.draftPosts) || 0,
          failed: parseInt(postsStats[0]?.failedPosts) || 0
        },
        whatsappStats: {
          botResponses: parseInt(whatsappStats[0]?.botResponses) || 0
        },
        telegramStats: {
          botResponses: parseInt(telegramStats[0]?.botResponses) || 0
        },
        // Add limits and usage for message management
        limits: limits,
        messageUsage: [
          {
            platform: 'whatsapp',
            count: whatsappUsage,
            limit: limits.whatsappMessagesPerMonth,
            remaining: Math.max(0, limits.whatsappMessagesPerMonth - whatsappUsage)
          },
          {
            platform: 'telegram',
            count: telegramUsage,
            limit: limits.telegramMessagesPerMonth,
            remaining: Math.max(0, limits.telegramMessagesPerMonth - telegramUsage)
          }
        ]
      },
      currentSubscription: currentSubscription,
      subscriptionHistory: subscriptionHistory
    });
  } catch (error) {
    console.error('Get billing analytics error:', error);
    console.error('Error stack:', error.stack);
    
    // Return a more detailed error response for debugging
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get billing analytics',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Get user's invoices (subscription requests)
async function getInvoices(req, res) {
  try {
    const userId = req.userId;
    const { status, search, page = 1, limit = 10 } = req.query;
    
    const whereClause = { userId: userId };
    
    if (status && status !== 'all') {
      whereClause.status = status;
    }
    
    if (search) {
      whereClause[Op.or] = [
        { id: { [Op.like]: `%${search}%` } },
        { paymentMethod: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (page - 1) * limit;
    
    const { count, rows: invoices } = await SubscriptionRequest.findAndCountAll({
      where: whereClause,
      include: [
        { model: Plan, as: 'plan' },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Format invoices for frontend
    const formattedInvoices = invoices.map(invoice => ({
      id: invoice.id,
      invoiceNumber: `INV-${invoice.id.toString().padStart(6, '0')}`,
      date: invoice.createdAt,
      dueDate: invoice.processedAt || new Date(invoice.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000),
      amount: invoice.plan ? invoice.plan.priceCents / 100 : 0,
      status: invoice.status === 'approved' ? 'paid' : 
              invoice.status === 'pending' ? 'pending' : 'overdue',
      plan: invoice.plan ? invoice.plan.name : 'غير محدد',
      description: `اشتراك ${invoice.plan ? invoice.plan.interval : 'شهري'} - ${invoice.plan ? invoice.plan.name : 'غير محدد'}`,
      paymentMethod: invoice.paymentMethod === 'usdt' ? 'USDT' : 
                    invoice.paymentMethod === 'coupon' ? 'قسيمة' : 'غير محدد'
    }));

    return res.json({
      success: true,
      invoices: formattedInvoices,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get invoices',
      error: error.message 
    });
  }
}

// Get revenue chart data
async function getRevenueChartData(req, res) {
  try {
    const userId = req.userId;
    const { months = 6 } = req.query;
    
    const now = new Date();
    const chartData = [];
    
    for (let i = months - 1; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      // Get subscriptions created in this month
      const monthSubscriptions = await UserSubscription.findAll({
        where: {
          userId: userId,
          createdAt: {
            [Op.gte]: monthStart,
            [Op.lte]: monthEnd
          }
        },
        include: [{ model: Plan, as: 'plan' }]
      });
      
      const monthRevenue = monthSubscriptions.reduce((sum, sub) => {
        return sum + (sub.plan ? sub.plan.priceCents : 0);
      }, 0);
      
      // Get posts created in this month
      const monthPosts = await Post.count({
        where: {
          userId: userId,
          createdAt: {
            [Op.gte]: monthStart,
            [Op.lte]: monthEnd
          }
        }
      });
      
      // Get bot responses sent in this month
      const [whatsappMessages, telegramMessages] = await Promise.all([
        MessageUsage.sum('count', {
          where: {
            userId: userId,
            platform: 'whatsapp',
            messageType: 'bot_response',
            month: monthStart.getMonth() + 1,
            year: monthStart.getFullYear()
          }
        }),
        MessageUsage.sum('count', {
          where: {
            userId: userId,
            platform: 'telegram',
            messageType: 'bot_response',
            month: monthStart.getMonth() + 1,
            year: monthStart.getFullYear()
          }
        })
      ]);
      
      const monthName = monthStart.toLocaleDateString('ar-SA', { month: 'long' });
      
      chartData.push({
        month: monthName,
        revenue: monthRevenue / 100, // Convert from cents
        users: 1, // Current user
        messages: (whatsappMessages || 0) + (telegramMessages || 0)
      });
    }
    
    return res.json({
      success: true,
      chartData: chartData
    });
  } catch (error) {
    console.error('Get revenue chart data error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get revenue chart data',
      error: error.message 
    });
  }
}

// Get plan distribution data
async function getPlanDistribution(req, res) {
  try {
    const userId = req.userId;
    
    const subscriptions = await UserSubscription.findAll({
      where: { userId: userId },
      include: [{ model: Plan, as: 'plan' }]
    });
    
    const planCounts = {};
    subscriptions.forEach(sub => {
      if (sub.plan) {
        const planName = sub.plan.name;
        planCounts[planName] = (planCounts[planName] || 0) + 1;
      }
    });
    
    const totalSubscriptions = subscriptions.length;
    const distribution = Object.entries(planCounts).map(([name, count]) => ({
      name: name,
      value: count,
      percentage: totalSubscriptions > 0 ? Math.round((count / totalSubscriptions) * 100) : 0
    }));
    
    return res.json({
      success: true,
      distribution: distribution
    });
  } catch (error) {
    console.error('Get plan distribution error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get plan distribution',
      error: error.message 
    });
  }
}

// Get payment method distribution
async function getPaymentMethodDistribution(req, res) {
  try {
    const userId = req.userId;
    
    const requests = await SubscriptionRequest.findAll({
      where: { userId: userId }
    });
    
    const methodCounts = {};
    requests.forEach(request => {
      const method = request.paymentMethod;
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    });
    
    const totalRequests = requests.length;
    const distribution = Object.entries(methodCounts).map(([method, count]) => ({
      name: method === 'usdt' ? 'USDT' : method === 'coupon' ? 'قسيمة' : method,
      value: count,
      percentage: totalRequests > 0 ? Math.round((count / totalRequests) * 100) : 0
    }));
    
    return res.json({
      success: true,
      distribution: distribution
    });
  } catch (error) {
    console.error('Get payment method distribution error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get payment method distribution',
      error: error.message 
    });
  }
}

// Get subscription timeline
async function getSubscriptionTimeline(req, res) {
  try {
    const userId = req.userId;
    
    const subscriptions = await UserSubscription.findAll({
      where: { userId: userId },
      include: [{ model: Plan, as: 'plan' }],
      order: [['createdAt', 'DESC']]
    });
    
    const timeline = subscriptions.map(sub => ({
      id: sub.id,
      date: sub.createdAt,
      title: `فاتورة ${sub.plan ? sub.plan.name : 'غير محدد'}`,
      description: `اشتراك ${sub.plan ? sub.plan.interval : 'شهري'} - ${sub.plan ? sub.plan.name : 'غير محدد'}`,
      status: sub.status === 'active' ? 'completed' : 
              sub.status === 'expired' ? 'overdue' : 'pending',
      amount: sub.plan ? sub.plan.priceCents / 100 : 0
    }));
    
    return res.json({
      success: true,
      timeline: timeline
    });
  } catch (error) {
    console.error('Get subscription timeline error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get subscription timeline',
      error: error.message 
    });
  }
}

module.exports = {
  getBillingAnalytics,
  getInvoices,
  getRevenueChartData,
  getPlanDistribution,
  getPaymentMethodDistribution,
  getSubscriptionTimeline
};
























