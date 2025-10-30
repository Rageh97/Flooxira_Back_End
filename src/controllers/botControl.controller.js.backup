const { User } = require('../models/user');
const whatsappService = require('../services/whatsappService');

// Get bot status for user
exports.getBotStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isPaused = user.botPaused;
    const pausedUntil = user.botPausedUntil;
    const timeRemaining = pausedUntil ? Math.max(0, Math.ceil((new Date(pausedUntil) - new Date()) / (1000 * 60))) : 0;

    res.json({
      success: true,
      data: {
        isPaused,
        pausedUntil: pausedUntil ? pausedUntil.toISOString() : null,
        timeRemaining: timeRemaining // in minutes
      }
    });
  } catch (error) {
    console.error('Get bot status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get bot status', error: error.message });
  }
};

// Pause bot for user
exports.pauseBot = async (req, res) => {
  try {
    const userId = req.user.id;
    const { minutes = 30 } = req.body;

    const success = await whatsappService.pauseBotForUser(userId, parseInt(minutes));
    
    if (success) {
      res.json({ 
        success: true, 
        message: `Bot paused for ${minutes} minutes`,
        data: { minutes: parseInt(minutes) }
      });
    } else {
      res.status(500).json({ success: false, message: 'Failed to pause bot' });
    }
  } catch (error) {
    console.error('Pause bot error:', error);
    res.status(500).json({ success: false, message: 'Failed to pause bot', error: error.message });
  }
};

// Resume bot for user
exports.resumeBot = async (req, res) => {
  try {
    const userId = req.user.id;

    const success = await whatsappService.resumeBotForUser(userId);
    
    if (success) {
      res.json({ 
        success: true, 
        message: 'Bot resumed successfully',
        data: { isPaused: false }
      });
    } else {
      res.status(500).json({ success: false, message: 'Failed to resume bot' });
    }
  } catch (error) {
    console.error('Resume bot error:', error);
    res.status(500).json({ success: false, message: 'Failed to resume bot', error: error.message });
  }
};


