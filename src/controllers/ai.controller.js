const { AIConversation } = require('../models/aiConversation');
const { AIMessage } = require('../models/aiMessage');
const { UserSubscription } = require('../models/userSubscription');
const { Plan } = require('../models/plan');
const { User } = require('../models/user');
const aiService = require('../services/aiService');
const { Op } = require('sequelize');

// Get user's AI conversations
async function getConversations(req, res) {
  try {
    const userId = req.userId;

    const conversations = await AIConversation.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
      include: [{
        model: AIMessage,
        as: 'messages',
        limit: 1,
        order: [['createdAt', 'DESC']]
      }]
    });

    return res.json({ 
      success: true, 
      conversations 
    });
  } catch (error) {
    console.error('Get conversations error:', error);
    return res.status(500).json({ message: 'فشل في جلب المحادثات' });
  }
}

// Get conversation messages
async function getConversationMessages(req, res) {
  try {
    const userId = req.userId;
    const { conversationId } = req.params;

    const conversation = await AIConversation.findOne({
      where: {
        id: conversationId,
        userId
      }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'المحادثة غير موجودة' });
    }

    const messages = await AIMessage.findAll({
      where: { conversationId },
      order: [['createdAt', 'ASC']]
    });

    return res.json({ 
      success: true, 
      conversation,
      messages 
    });
  } catch (error) {
    console.error('Get conversation messages error:', error);
    return res.status(500).json({ message: 'فشل في جلب الرسائل' });
  }
}

// Create new conversation
async function createConversation(req, res) {
  try {
    const userId = req.userId;
    const { title } = req.body;

    const conversation = await AIConversation.create({
      userId,
      title: title || 'محادثة جديدة'
    });

    return res.status(201).json({ 
      success: true, 
      conversation 
    });
  } catch (error) {
    console.error('Create conversation error:', error);
    return res.status(500).json({ message: 'فشل في إنشاء المحادثة' });
  }
}

// Send message and get AI response
async function sendMessage(req, res) {
  try {
    const userId = req.userId;
    const { conversationId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'الرسالة مطلوبة' });
    }

    // Check conversation ownership
    const conversation = await AIConversation.findOne({
      where: {
        id: conversationId,
        userId
      }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'المحادثة غير موجودة' });
    }

    // Check AI credits
    const subscription = await UserSubscription.findOne({
      where: {
        userId,
        status: 'active',
        expiresAt: {
          [Op.gt]: new Date()
        }
      },
      include: [{
        model: Plan,
        as: 'plan'
      }],
      order: [['expiresAt', 'DESC']]
    });

    if (!subscription) {
      return res.status(403).json({ message: 'ليس لديك اشتراك نشط' });
    }

    const permissions = subscription.plan?.permissions || {};
    const aiCredits = permissions.aiCredits || 0;
    const aiCreditsUsed = subscription.aiCreditsUsed || 0;

    // Check if unlimited or has remaining credits
    if (aiCredits > 0 && aiCreditsUsed >= aiCredits) {
      return res.status(403).json({ 
        message: 'لقد استنفدت كريديت AI الخاص بك. يرجى ترقية باقتك أو انتظار التجديد.',
        remainingCredits: 0
      });
    }

    // Save user message
    const userMessage = await AIMessage.create({
      conversationId,
      role: 'user',
      content: content.trim(),
      creditsUsed: 0
    });

    // Get conversation history
    const previousMessages = await AIMessage.findAll({
      where: { conversationId },
      order: [['createdAt', 'ASC']],
      limit: 20 // Last 20 messages for context
    });

    const messagesForAI = previousMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Generate AI response
    const aiResponse = await aiService.generateContent(messagesForAI);

    // Save AI message
    const assistantMessage = await AIMessage.create({
      conversationId,
      role: 'assistant',
      content: aiResponse.content,
      creditsUsed: aiResponse.creditsUsed
    });

    // Update subscription credits
    subscription.aiCreditsUsed = (subscription.aiCreditsUsed || 0) + aiResponse.creditsUsed;
    await subscription.save();

    // Update conversation title if it's the first message
    if (previousMessages.length <= 1 && conversation.title === 'محادثة جديدة') {
      const newTitle = content.substring(0, 50) + (content.length > 50 ? '...' : '');
      conversation.title = newTitle;
      await conversation.save();
    }

    // Update conversation updatedAt
    conversation.changed('updatedAt', true);
    await conversation.save();

    return res.json({ 
      success: true, 
      userMessage,
      assistantMessage,
      remainingCredits: aiCredits > 0 ? aiCredits - subscription.aiCreditsUsed : -1,
      conversation
    });
  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({ 
      message: error.message || 'فشل في إرسال الرسالة' 
    });
  }
}

// Delete conversation
async function deleteConversation(req, res) {
  try {
    const userId = req.userId;
    const { conversationId } = req.params;

    const conversation = await AIConversation.findOne({
      where: {
        id: conversationId,
        userId
      }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'المحادثة غير موجودة' });
    }

    await conversation.destroy();

    return res.json({ 
      success: true, 
      message: 'تم حذف المحادثة بنجاح' 
    });
  } catch (error) {
    console.error('Delete conversation error:', error);
    return res.status(500).json({ message: 'فشل في حذف المحادثة' });
  }
}

// Get AI stats
async function getAIStats(req, res) {
  try {
    const userId = req.userId;

    const subscription = await UserSubscription.findOne({
      where: {
        userId,
        status: 'active',
        expiresAt: {
          [Op.gt]: new Date()
        }
      },
      include: [{
        model: Plan,
        as: 'plan'
      }],
      order: [['expiresAt', 'DESC']]
    });

    if (!subscription) {
      return res.status(403).json({ message: 'ليس لديك اشتراك نشط' });
    }

    const permissions = subscription.plan?.permissions || {};
    const aiCredits = permissions.aiCredits || 0;
    const aiCreditsUsed = subscription.aiCreditsUsed || 0;

    const conversationsCount = await AIConversation.count({
      where: { userId }
    });

    return res.json({ 
      success: true, 
      stats: {
        totalCredits: aiCredits,
        usedCredits: aiCreditsUsed,
        remainingCredits: aiCredits > 0 ? Math.max(0, aiCredits - aiCreditsUsed) : -1,
        isUnlimited: aiCredits === 0,
        conversationsCount,
        resetAt: subscription.aiCreditsResetAt
      }
    });
  } catch (error) {
    console.error('Get AI stats error:', error);
    return res.status(500).json({ message: 'فشل في جلب الإحصائيات' });
  }
}

// Update conversation title
async function updateConversationTitle(req, res) {
  try {
    const userId = req.userId;
    const { conversationId } = req.params;
    const { title } = req.body;

    const conversation = await AIConversation.findOne({
      where: {
        id: conversationId,
        userId
      }
    });

    if (!conversation) {
      return res.status(404).json({ message: 'المحادثة غير موجودة' });
    }

    conversation.title = title || 'محادثة جديدة';
    await conversation.save();

    return res.json({ 
      success: true, 
      conversation 
    });
  } catch (error) {
    console.error('Update conversation title error:', error);
    return res.status(500).json({ message: 'فشل في تحديث العنوان' });
  }
}

module.exports = {
  getConversations,
  getConversationMessages,
  createConversation,
  sendMessage,
  deleteConversation,
  getAIStats,
  updateConversationTitle
};















