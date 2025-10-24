const { BotSettings } = require('../models/botSettings');
const { User } = require('../models/user');

// Get bot settings for current user
exports.getBotSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    
    let settings = await BotSettings.findOne({
      where: { userId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
    });
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = await BotSettings.create({
        userId,
        // Default values are set in the model
      });
    }
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error getting bot settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bot settings',
      error: error.message
    });
  }
};

// Update bot settings
exports.updateBotSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    const updateData = req.body || {};
    
    // Handle autoReplyTemplateId conversion
    if (updateData.autoReplyTemplateId !== undefined) {
      if (updateData.autoReplyTemplateId === null || updateData.autoReplyTemplateId === '') {
        updateData.autoReplyTemplateId = null;
      } else {
        updateData.autoReplyTemplateId = Number(updateData.autoReplyTemplateId) || null;
      }
    }
    
    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.userId;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    
    // Validate required fields
    if (updateData.temperature !== undefined && (updateData.temperature < 0 || updateData.temperature > 2)) {
      return res.status(400).json({
        success: false,
        message: 'Temperature must be between 0 and 2'
      });
    }
    
    if (updateData.maxTokens !== undefined && (updateData.maxTokens < 100 || updateData.maxTokens > 4000)) {
      return res.status(400).json({
        success: false,
        message: 'Max tokens must be between 100 and 4000'
      });
    }
    
    if (updateData.contextWindow !== undefined && (updateData.contextWindow < 5 || updateData.contextWindow > 50)) {
      return res.status(400).json({
        success: false,
        message: 'Context window must be between 5 and 50'
      });
    }

    // Validate working hours settings
    if (updateData.workingHoursEnabled && updateData.workingHoursStart && updateData.workingHoursEnd) {
      const startTime = new Date(`2000-01-01T${updateData.workingHoursStart}`);
      const endTime = new Date(`2000-01-01T${updateData.workingHoursEnd}`);
      
      if (startTime >= endTime) {
        return res.status(400).json({
          success: false,
          message: 'وقت البداية يجب أن يكون قبل وقت النهاية'
        });
      }
    }

    if (updateData.workingDays && !Array.isArray(updateData.workingDays)) {
      return res.status(400).json({
        success: false,
        message: 'أيام العمل يجب أن تكون مصفوفة'
      });
    }
    
    // Find or create settings
    let settings = await BotSettings.findOne({ where: { userId } });
    
    if (settings) {
      // Update existing settings
      await settings.update(updateData);
    } else {
      // Create new settings
      // Ensure user exists before creating settings
      const { User } = require('../models/user');
      const exists = await User.findByPk(userId);
      if (!exists) {
        return res.status(400).json({ success: false, message: 'Invalid user' });
      }
      settings = await BotSettings.create({ userId, ...updateData });
    }
    
    res.json({
      success: true,
      data: settings,
      message: 'Bot settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating bot settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update bot settings',
      error: error.message
    });
  }
};

// Reset bot settings to default
exports.resetBotSettings = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Delete existing settings
    await BotSettings.destroy({ where: { userId } });
    
    // Create new default settings
    const defaultSettings = await BotSettings.create({ userId });
    
    res.json({
      success: true,
      data: defaultSettings,
      message: 'Bot settings reset to default successfully'
    });
  } catch (error) {
    console.error('Error resetting bot settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset bot settings',
      error: error.message
    });
  }
};

// Test AI response with current settings
exports.testAIResponse = async (req, res) => {
  try {
    const userId = req.user.id;
    const { testMessage } = req.body;
    
    if (!testMessage) {
      return res.status(400).json({
        success: false,
        message: 'Test message is required'
      });
    }
    
    // Get current settings
    const settings = await BotSettings.findOne({ where: { userId } });
    if (!settings) {
      return res.status(404).json({
        success: false,
        message: 'Bot settings not found'
      });
    }
    
    // For now, just return the settings - AI integration can be added later
    res.json({
      success: true,
      data: {
        testMessage,
        settings: {
          personality: settings.personality,
          dialect: settings.dialect,
          temperature: settings.temperature
        }
      }
    });
  } catch (error) {
    console.error('Error testing AI response:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test AI response',
      error: error.message
    });
  }
};

// Get available AI models
exports.getAvailableModels = async (req, res) => {
  try {
    const models = {
      openai: [
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Most capable model' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Faster and cheaper' },
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient' }
      ],
      gemini: [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast and efficient' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Most capable Gemini model' }
      ]
    };
    
    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    console.error('Error getting available models:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get available models',
      error: error.message
    });
  }
};

// Get personality templates
exports.getPersonalityTemplates = async (req, res) => {
  try {
    const templates = {
      professional: {
        name: 'Professional',
        description: 'Formal and business-like responses',
        systemPrompt: 'You are a professional customer service representative. Maintain a formal tone and provide helpful, accurate information.',
        greetingPrompt: 'Hello! How can I assist you today?',
        farewellPrompt: 'Thank you for your time. Good day.'
      },
      friendly: {
        name: 'Friendly',
        description: 'Warm and approachable responses',
        systemPrompt: 'You are a friendly and helpful assistant. Be warm, empathetic, and make customers feel comfortable.',
        greetingPrompt: 'Hi there! I\'m here to help you with anything you need.',
        farewellPrompt: 'Thanks for chatting! Have a great day!'
      },
      casual: {
        name: 'Casual',
        description: 'Relaxed and informal responses',
        systemPrompt: 'You are a casual and easygoing assistant. Keep things light and conversational.',
        greetingPrompt: 'Hey! What\'s up? How can I help you today?',
        farewellPrompt: 'Catch you later! Take care!'
      },
      formal: {
        name: 'Formal',
        description: 'Very formal and structured responses',
        systemPrompt: 'You are a formal business representative. Use proper business etiquette and formal language.',
        greetingPrompt: 'Good day. How may I be of assistance to you?',
        farewellPrompt: 'Thank you for your time. Good day.'
      },
      marketing: {
        name: 'Marketing',
        description: 'Sales-focused and persuasive responses',
        systemPrompt: 'You are a skilled sales representative with 15 years of experience. Focus on understanding customer needs and providing solutions.',
        greetingPrompt: 'Welcome! I\'m here to help you find the perfect solution.',
        farewellPrompt: 'Thank you for your interest. I look forward to serving you!'
      }
    };
    
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error getting personality templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get personality templates',
      error: error.message
    });
  }
};