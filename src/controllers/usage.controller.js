const limitService = require('../services/limitService');

// Get usage statistics for a user
async function getUsageStats(req, res) {
  try {
    const userId = req.userId;
    const { platform } = req.query;

    if (!platform || !['whatsapp', 'telegram'].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: 'Platform parameter is required (whatsapp or telegram)'
      });
    }

    let stats, limits;
    try {
      stats = await limitService.getUsageStats(userId, platform);
      limits = await limitService.getUserLimits(userId);
    } catch (limitError) {
      console.error('Error getting limits/stats:', limitError);
      // Return default values if limitService fails
      stats = { count: 0, percentage: 0, isNearLimit: false };
      limits = { [`${platform}MessagesPerMonth`]: 0 };
    }

    res.json({
      success: true,
      data: {
        platform,
        usage: stats,
        limits: limits,
        warning: stats.isNearLimit ? `You have used ${stats.percentage}% of your monthly ${platform} messages` : null
      }
    });
  } catch (error) {
    console.error('Error getting usage stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get usage statistics',
      error: error.message
    });
  }
}

// Get all usage statistics for a user
async function getAllUsageStats(req, res) {
  try {
    const userId = req.userId;
    
    let limits, whatsappStats, telegramStats;
    try {
      limits = await limitService.getUserLimits(userId);
      whatsappStats = await limitService.getUsageStats(userId, 'whatsapp');
      telegramStats = await limitService.getUsageStats(userId, 'telegram');
    } catch (limitError) {
      console.error('Error getting limits/stats:', limitError);
      // Return default values if limitService fails
      limits = { whatsappMessagesPerMonth: 0, telegramMessagesPerMonth: 0 };
      whatsappStats = { count: 0, percentage: 0, isNearLimit: false };
      telegramStats = { count: 0, percentage: 0, isNearLimit: false };
    }

    res.json({
      success: true,
      data: {
        limits: limits,
        whatsapp: whatsappStats,
        telegram: telegramStats,
        warnings: [
          ...(whatsappStats.isNearLimit ? [`WhatsApp: ${whatsappStats.percentage}% used`] : []),
          ...(telegramStats.isNearLimit ? [`Telegram: ${telegramStats.percentage}% used`] : [])
        ]
      }
    });
  } catch (error) {
    console.error('Error getting all usage stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get usage statistics',
      error: error.message
    });
  }
}

module.exports = {
  getUsageStats,
  getAllUsageStats
};




