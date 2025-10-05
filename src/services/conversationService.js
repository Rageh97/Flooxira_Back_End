const { WhatsappChat } = require('../models/whatsappChat');
const { Op } = require('sequelize');

class ConversationService {
  constructor() {
    this.activeSessions = new Map(); // In-memory session cache
  }

  // Generate session ID for conversation tracking
  generateSessionId(userId, contactNumber) {
    return `${userId}_${contactNumber}_${Date.now()}`;
  }

  // Get or create conversation session
  async getOrCreateSession(userId, contactNumber) {
    const sessionKey = `${userId}_${contactNumber}`;
    
    // Check if there's an active session in memory
    if (this.activeSessions.has(sessionKey)) {
      return this.activeSessions.get(sessionKey);
    }

    // Look for recent conversation in database (last 24 hours for better memory)
    const recentChat = await WhatsappChat.findOne({
      where: {
        userId,
        contactNumber,
        timestamp: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
        }
      },
      order: [['timestamp', 'DESC']]
    });

    let sessionId;
    if (recentChat && recentChat.sessionId) {
      sessionId = recentChat.sessionId;
    } else {
      sessionId = this.generateSessionId(userId, contactNumber);
    }

    // Cache session
    this.activeSessions.set(sessionKey, sessionId);
    
    // Auto-cleanup after 6 hours (longer memory)
    setTimeout(() => {
      this.activeSessions.delete(sessionKey);
    }, 6 * 60 * 60 * 1000);

    return sessionId;
  }

  // Get conversation history for context
  async getConversationHistory(userId, contactNumber, limit = 15) {
    const sessionId = await this.getOrCreateSession(userId, contactNumber);
    
    const history = await WhatsappChat.findAll({
      where: {
        userId,
        contactNumber,
        sessionId,
        timestamp: {
          [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      order: [['timestamp', 'DESC']],
      limit: limit * 2 // Get both incoming and outgoing
    });

    return history.reverse(); // Chronological order
  }

  // Build context for AI from conversation history
  buildContextFromHistory(history) {
    if (!history || history.length === 0) return null;

    const context = {
      previousMessages: [],
      customerInfo: {},
      conversationSummary: '',
      isReturningCustomer: false,
      lastGreetingTime: null,
      serviceContext: []
    };

    // Extract key information from conversation
    let customerName = null;
    let interestedProducts = [];
    let priceDiscussions = [];
    let lastIntent = null;
    let serviceMentions = [];
    let greetingCount = 0;
    let lastGreetingTime = null;

    for (const chat of history) {
      const message = {
        role: chat.messageType === 'incoming' ? 'user' : 'assistant',
        content: chat.messageContent,
        timestamp: chat.timestamp,
        source: chat.responseSource
      };
      
      context.previousMessages.push(message);

      // Extract customer insights
      if (chat.messageType === 'incoming') {
        const content = chat.messageContent.toLowerCase();
        
        // Detect greetings to avoid repetition
        if (content.includes('السلام') || content.includes('مرحبا') || content.includes('أهلا') || 
            content.includes('صباح') || content.includes('مساء') || content.includes('مساءك')) {
          greetingCount++;
          lastGreetingTime = chat.timestamp;
        }
        
        // Detect name mentions
        const nameMatch = content.match(/(اسمي|انا|اسم)\s+(\w+)/);
        if (nameMatch) customerName = nameMatch[2];
        
        // Track product interests and services
        if (content.includes('منتج') || content.includes('خدمة') || content.includes('لعبة') || 
            content.includes('تطبيق') || content.includes('برنامج')) {
          interestedProducts.push(content);
        }
        
        // Track specific service mentions
        if (content.includes('ايفون') || content.includes('اندرويد') || content.includes('جيم') || 
            content.includes('تطوير') || content.includes('تصميم') || content.includes('برمجة')) {
          serviceMentions.push(content);
        }
        
        // Track price discussions
        if (content.includes('سعر') || content.includes('غالي') || content.includes('رخيص') || 
            content.includes('تكلفة') || content.includes('ثمن')) {
          priceDiscussions.push(content);
        }

        // Detect last intent
        if (content.includes('مستعد') || content.includes('اشتري') || content.includes('موافق')) {
          lastIntent = 'ready_to_buy';
        } else if (content.includes('كوبون') || content.includes('خصم') || content.includes('تخفيض')) {
          lastIntent = 'seeking_discount';
        } else if (content.includes('سعر') || content.includes('تكلفة')) {
          lastIntent = 'price_inquiry';
        } else if (content.includes('تفاصيل') || content.includes('معلومات')) {
          lastIntent = 'information_seeking';
        }
      }
    }

    // Determine if returning customer
    const isReturningCustomer = history.length > 2 || greetingCount > 1;

    // Build customer profile with enhanced memory
    context.customerInfo = {
      name: customerName,
      interestedProducts: [...new Set(interestedProducts)],
      serviceMentions: [...new Set(serviceMentions)],
      priceDiscussions: priceDiscussions.length,
      lastIntent,
      conversationLength: history.length,
      isReturningCustomer,
      greetingCount,
      lastGreetingTime
    };

    // Build service context from previous conversations
    context.serviceContext = serviceMentions.slice(-3); // Last 3 service mentions

    // Build conversation summary with more context
    const recentMessages = context.previousMessages.slice(-8); // More context
    context.conversationSummary = recentMessages
      .map(m => `${m.role}: ${m.content.slice(0, 150)}`)
      .join('\n');

    return context;
  }

  // Save message with context
  async saveMessage(userId, contactNumber, messageType, messageContent, responseSource = null, knowledgeBaseMatch = null) {
    const sessionId = await this.getOrCreateSession(userId, contactNumber);
    const context = await this.getConversationHistory(userId, contactNumber, 5);
    
    return await WhatsappChat.create({
      userId,
      contactNumber,
      messageType,
      messageContent,
      responseSource,
      knowledgeBaseMatch,
      sessionId,
      context: this.buildContextFromHistory(context),
      timestamp: new Date()
    });
  }

  // Get smart context for AI response
  async getSmartContext(userId, contactNumber) {
    const history = await this.getConversationHistory(userId, contactNumber, 8);
    const context = this.buildContextFromHistory(history);
    
    if (!context) return null;

    // Build AI-friendly context
    const aiContext = {
      customerName: context.customerInfo.name,
      conversationStage: this.determineConversationStage(context),
      previousTopics: context.customerInfo.interestedProducts,
      lastIntent: context.customerInfo.lastIntent,
      recentMessages: context.previousMessages.slice(-4).map(m => ({
        role: m.role,
        content: m.content
      }))
    };

    return aiContext;
  }

  // Determine conversation stage for better responses
  determineConversationStage(context) {
    if (!context || !context.customerInfo) return 'initial';
    
    const { lastIntent, conversationLength, priceDiscussions, isReturningCustomer, greetingCount } = context.customerInfo;
    
    // Enhanced stage detection with memory awareness
    if (lastIntent === 'ready_to_buy') return 'closing';
    if (lastIntent === 'seeking_discount') return 'negotiation';
    if (priceDiscussions > 2) return 'price_sensitive';
    if (conversationLength > 15) return 'engaged';
    if (conversationLength > 5) return 'interested';
    if (isReturningCustomer && greetingCount > 1) return 'returning_customer';
    if (isReturningCustomer) return 'familiar_customer';
    
    return 'exploration';
  }

  // Clean old conversations (run periodically)
  async cleanOldConversations() {
    const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    await WhatsappChat.destroy({
      where: {
        timestamp: {
          [Op.lt]: cutoffDate
        }
      }
    });
  }
}

module.exports = new ConversationService();