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

    const stats = await limitService.getUsageStats(userId, platform);
    const limits = await limitService.getUserLimits(userId);

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
    const limits = await limitService.getUserLimits(userId);
    
    const whatsappStats = await limitService.getUsageStats(userId, 'whatsapp');
    const telegramStats = await limitService.getUsageStats(userId, 'telegram');

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




