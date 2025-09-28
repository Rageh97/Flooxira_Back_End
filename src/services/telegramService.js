const { Telegraf } = require('telegraf');
const { KnowledgeBase } = require('../models/knowledgeBase');
const { TelegramChat } = require('../models/telegramChat');
const { TelegramAccount } = require('../models/telegramAccount');
const { User } = require('../models/user');
const { sequelize } = require('../sequelize');
const Fuse = require('fuse.js');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class TelegramService {
  constructor() {
    this.userBots = new Map();
    this.userStates = new Map();
    this.messageCounters = new Map();
    this.setupErrorHandlers();
  }

  setupErrorHandlers() {
    // Remove all existing handlers first to prevent duplicates
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('uncaughtException');

    process.on('unhandledRejection', (reason, promise) => {
      if (reason && reason.message && (
        reason.message.includes('EBUSY') ||
        reason.message.includes('resource busy or locked') ||
        reason.message.includes('TELEGRAM') ||
        reason.message.includes('webhook')
      )) {
        return;
      }
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      if (error && error.message && (
        error.message.includes('EBUSY') ||
        error.message.includes('resource busy or locked') ||
        error.message.includes('TELEGRAM') ||
        error.message.includes('webhook')
      )) {
        return;
      }
      console.error('Uncaught Exception:', error);
    });
  }

  async createBot(userId, botToken) {
    try {
      // Validate bot token by getting bot info
      const bot = new Telegraf(botToken);
      const botInfo = await bot.telegram.getMe();
      
      // Check if bot already exists for this user
      const existingAccount = await TelegramAccount.findOne({
        where: { userId, botToken }
      });

      if (existingAccount) {
        return {
          success: false,
          message: 'Bot with this token already exists for this user'
        };
      }

      // Create or update account
      const [account, created] = await TelegramAccount.findOrCreate({
        where: { userId, botToken },
        defaults: {
          botToken,
          botUsername: botInfo.username,
          botName: botInfo.first_name,
          isActive: true
        }
      });

      if (!created) {
        // Update existing account
        account.botUsername = botInfo.username;
        account.botName = botInfo.first_name;
        account.isActive = true;
        await account.save();
      }

      // Store bot instance
      this.userBots.set(userId, bot);
      
      // Set up message handlers
      this.setupBotHandlers(bot, userId);

      return {
        success: true,
        message: 'Telegram bot created successfully',
        botInfo: {
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name,
          can_join_groups: botInfo.can_join_groups,
          can_read_all_group_messages: botInfo.can_read_all_group_messages
        }
      };

    } catch (error) {
      console.error('Create bot error:', error);
      return {
        success: false,
        message: 'Failed to create bot. Please check your bot token.',
        error: error.message
      };
    }
  }

  setupBotHandlers(bot, userId) {
    // Start command
    bot.start((ctx) => {
      ctx.reply('Hello! I am your Telegram bot. How can I help you today?');
    });

    // Help command
    bot.help((ctx) => {
      ctx.reply('I am here to help! Send me any message and I will respond based on my knowledge base.');
    });

    // Handle all text messages
    bot.on('text', async (ctx) => {
      try {
        await this.handleIncomingMessage(ctx, userId);
      } catch (error) {
        console.error('Error handling message:', error);
        ctx.reply('Sorry, I encountered an error processing your message.');
      }
    });

    // Handle callback queries (inline keyboard buttons)
    bot.on('callback_query', async (ctx) => {
      try {
        await ctx.answerCbQuery();
        await this.handleIncomingMessage(ctx, userId);
      } catch (error) {
        console.error('Error handling callback query:', error);
      }
    });

    // Error handling
    bot.catch((err, ctx) => {
      console.error('Bot error:', err);
      ctx.reply('Sorry, I encountered an error. Please try again.');
    });
  }

  async handleIncomingMessage(ctx, userId) {
    try {
      // Track message count
      const currentCount = this.messageCounters.get(userId) || 0;
      this.messageCounters.set(userId, currentCount + 1);
      
      const message = ctx.message || ctx.callbackQuery;
      const chatId = ctx.chat.id.toString();
      const chatType = ctx.chat.type;
      const chatTitle = ctx.chat.title || ctx.chat.first_name || 'Unknown';
      const messageText = message.text || message.data || '';
      const messageId = message.message_id?.toString();

      console.log(`[TG] Processing message #${currentCount + 1} from ${chatId}: ${messageText}`);
      
      // Log incoming message
      await this.logChatMessage(userId, chatId, chatType, chatTitle, 'incoming', messageText, messageId);
      
      let response = '';
      let responseSource = 'fallback';
      let knowledgeBaseMatch = null;
      
      // Get user's knowledge base
      const knowledgeEntries = await KnowledgeBase.findAll({
        where: { userId, isActive: true }
      });

      if (knowledgeEntries.length > 0) {
        // Use fuzzy matching to find best answer
        const fuse = new Fuse(knowledgeEntries, {
          keys: ['keyword'],
          threshold: 0.6,
          includeScore: true
        });

        const results = fuse.search(messageText);
        
        if (results.length > 0 && results[0].score < 0.6) {
          response = results[0].item.answer;
          responseSource = 'knowledge_base';
          knowledgeBaseMatch = results[0].item.keyword;
          console.log(`[TG] Found knowledge base match: ${results[0].item.keyword}`);
        }
      }

      // If no knowledge base match, use OpenAI as fallback
      if (!response) {
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "You are a helpful Telegram bot assistant. Provide concise, helpful responses to user queries. Keep responses under 200 characters when possible. If you don't know something, politely say you don't have that information."
              },
              {
                role: "user",
                content: messageText
              }
            ],
            max_tokens: 150
          });
          response = completion.choices[0].message.content;
          responseSource = 'openai';
        } catch (openaiError) {
          console.error('OpenAI error:', openaiError);
          response = "نحن الان في وضع التطوير سستتحسن التجربة قريبا...";
          responseSource = 'fallback';
        }
      }

      // Final fallback response
      if (!response) {
        if (messageText && messageText.trim()) {
          response = `Echo: ${messageText.trim()}`;
        } else {
          response = 'Hello! How can I help you today?';
        }
        responseSource = 'fallback';
      }

      // Send response (with 2s delay) and log it
      if (response) {
        // Delay 2 seconds before replying
        await new Promise(r => setTimeout(r, 2000));
        await this.sendMessage(userId, chatId, response);
        await this.logChatMessage(userId, chatId, chatType, chatTitle, 'outgoing', response, null, responseSource, knowledgeBaseMatch);
      }

    } catch (error) {
      console.error('Message handling error:', error);
    }
  }

  async logChatMessage(userId, chatId, chatType, chatTitle, messageType, messageContent, messageId, responseSource, knowledgeBaseMatch) {
    try {
      await TelegramChat.create({
        userId,
        chatId,
        chatType,
        chatTitle,
        messageType,
        messageContent,
        messageId,
        responseSource,
        knowledgeBaseMatch,
        isProcessed: true
      });
    } catch (error) {
      console.error('Error logging chat message:', error);
    }
  }

  async sendMessage(userId, chatId, message) {
    try {
      const bot = this.userBots.get(userId);
      if (!bot) {
        console.log(`[TG] No bot available for user ${userId}`);
        return false;
      }

      await bot.telegram.sendMessage(chatId, message);
      console.log(`[TG] Message sent successfully to ${chatId}`);
      return true;
    } catch (error) {
      console.error(`[TG] Send message failed:`, error);
      return false;
    }
  }

  async sendPhoto(userId, chatId, photo, caption = '') {
    try {
      const bot = this.userBots.get(userId);
      if (!bot) {
        console.log(`[TG] No bot available for user ${userId}`);
        return false;
      }

      await bot.telegram.sendPhoto(chatId, photo, { caption });
      console.log(`[TG] Photo sent successfully to ${chatId}`);
      return true;
    } catch (error) {
      console.error(`[TG] Send photo failed:`, error);
      return false;
    }
  }

  async sendDocument(userId, chatId, document, caption = '') {
    try {
      const bot = this.userBots.get(userId);
      if (!bot) {
        console.log(`[TG] No bot available for user ${userId}`);
        return false;
      }

      await bot.telegram.sendDocument(chatId, document, { caption });
      console.log(`[TG] Document sent successfully to ${chatId}`);
      return true;
    } catch (error) {
      console.error(`[TG] Send document failed:`, error);
      return false;
    }
  }

  async getBotStatus(userId) {
    const bot = this.userBots.get(userId);
    const account = await TelegramAccount.findOne({ where: { userId, isActive: true } });

    if (!bot || !account) {
      return {
        success: true,
        status: 'disconnected',
        message: 'No active Telegram bot'
      };
    }

    try {
      const botInfo = await bot.telegram.getMe();
      return {
        success: true,
        status: 'connected',
        message: 'Telegram bot is active',
        botInfo: {
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name
        }
      };
    } catch (error) {
      return {
        success: true,
        status: 'error',
        message: 'Could not determine bot status',
        error: error.message
      };
    }
  }

  async stopBot(userId) {
    try {
      const bot = this.userBots.get(userId);
      if (bot) {
        await bot.stop();
      }
      
      this.userBots.delete(userId);
      
      // Deactivate account
      await TelegramAccount.update(
        { isActive: false },
        { where: { userId } }
      );
      
      return { success: true, message: 'Telegram bot stopped' };
    } catch (error) {
      console.error('Stop bot error:', error);
      return { success: false, message: 'Failed to stop bot', error: error.message };
    }
  }

  async getChatHistory(userId, chatId = null, limit = 50, offset = 0) {
    try {
      const whereClause = { userId };
      if (chatId) {
        whereClause.chatId = chatId;
      }

      const chats = await TelegramChat.findAll({
        where: whereClause,
        order: [['timestamp', 'DESC']],
        limit,
        offset
      });

      return {
        success: true,
        chats: chats.map(chat => ({
          id: chat.id,
          chatId: chat.chatId,
          chatType: chat.chatType,
          chatTitle: chat.chatTitle,
          messageType: chat.messageType,
          messageContent: chat.messageContent,
          responseSource: chat.responseSource,
          knowledgeBaseMatch: chat.knowledgeBaseMatch,
          timestamp: chat.timestamp
        }))
      };
    } catch (error) {
      console.error('Get chat history error:', error);
      return { success: false, message: 'Failed to get chat history', error: error.message };
    }
  }

  async getChatContacts(userId) {
    try {
      const contacts = await TelegramChat.findAll({
        where: { userId },
        attributes: [
          'chatId',
          'chatType',
          'chatTitle',
          [sequelize.fn('COUNT', sequelize.col('id')), 'messageCount'],
          [sequelize.fn('MAX', sequelize.col('timestamp')), 'lastMessageTime']
        ],
        group: ['chatId', 'chatType', 'chatTitle'],
        order: [[sequelize.fn('MAX', sequelize.col('timestamp')), 'DESC']]
      });

      return {
        success: true,
        contacts: contacts.map(contact => ({
          chatId: contact.chatId,
          chatType: contact.chatType,
          chatTitle: contact.chatTitle,
          messageCount: parseInt(contact.dataValues.messageCount),
          lastMessageTime: contact.dataValues.lastMessageTime
        }))
      };
    } catch (error) {
      console.error('Get chat contacts error:', error);
      return { success: false, message: 'Failed to get chat contacts', error: error.message };
    }
  }

  async getBotStats(userId) {
    try {
      const stats = await TelegramChat.findAll({
        where: { userId },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalMessages'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN messageType = "incoming" THEN 1 END')), 'incomingMessages'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN messageType = "outgoing" THEN 1 END')), 'outgoingMessages'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN responseSource = "knowledge_base" THEN 1 END')), 'knowledgeBaseResponses'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN responseSource = "openai" THEN 1 END')), 'openaiResponses'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN responseSource = "fallback" THEN 1 END')), 'fallbackResponses']
        ],
        raw: true
      });

      const totalContacts = await TelegramChat.count({
        where: { userId },
        distinct: true,
        col: 'chatId'
      });

      return {
        success: true,
        stats: {
          totalMessages: parseInt(stats[0].totalMessages) || 0,
          incomingMessages: parseInt(stats[0].incomingMessages) || 0,
          outgoingMessages: parseInt(stats[0].outgoingMessages) || 0,
          totalContacts: totalContacts,
          knowledgeBaseResponses: parseInt(stats[0].knowledgeBaseResponses) || 0,
          openaiResponses: parseInt(stats[0].openaiResponses) || 0,
          fallbackResponses: parseInt(stats[0].fallbackResponses) || 0
        }
      };
    } catch (error) {
      console.error('Get bot stats error:', error);
      return { success: false, message: 'Failed to get bot stats', error: error.message };
    }
  }

  // ===== Groups and Channels =====
  async listGroups(userId) {
    try {
      const bot = this.userBots.get(userId);
      if (!bot) return { success: false, message: 'Bot not connected' };
      
      // Get chats from database
      const chats = await TelegramChat.findAll({
        where: { 
          userId,
          chatType: ['group', 'supergroup', 'channel']
        },
        attributes: [
          'chatId',
          'chatType',
          'chatTitle',
          [sequelize.fn('COUNT', sequelize.col('id')), 'messageCount']
        ],
        group: ['chatId', 'chatType', 'chatTitle'],
        order: [[sequelize.fn('MAX', sequelize.col('timestamp')), 'DESC']]
      });

      return {
        success: true,
        groups: chats.map(chat => ({
          id: chat.chatId,
          name: chat.chatTitle || chat.chatId,
          type: chat.chatType,
          messageCount: parseInt(chat.dataValues.messageCount)
        }))
      };
    } catch (e) {
      return { success: false, message: 'Failed to list groups', error: e.message };
    }
  }

  async sendToGroup(userId, groupId, message, media = null) {
    try {
      const bot = this.userBots.get(userId);
      if (!bot) return { success: false, message: 'Bot not connected' };
      
      if (media && media.buffer) {
        // Send media with caption
        const base64 = media.buffer.toString('base64');
        const dataUri = `data:${media.mimetype};base64,${base64}`;
        
        if (media.mimetype.startsWith('image/')) {
          await bot.telegram.sendPhoto(groupId, dataUri, { caption: message || '' });
        } else if (media.mimetype.startsWith('video/')) {
          await bot.telegram.sendVideo(groupId, dataUri, { caption: message || '' });
        } else {
          await bot.telegram.sendDocument(groupId, dataUri, { caption: message || '' });
        }
      } else {
        await bot.telegram.sendMessage(groupId, message);
      }
      
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Failed to send to group', error: e.message };
    }
  }

  async sendToMultipleGroups(userId, groupIds, message, media, scheduleAt) {
    try {
      const bot = this.userBots.get(userId);
      if (!bot) return { success: false, message: 'Bot not connected' };

      const now = Date.now();
      let scheduledFor = null;
      if (scheduleAt) {
        const t = new Date(scheduleAt).getTime();
        if (!isNaN(t) && t > now) scheduledFor = t;
      }

      const sendToGroup = async (groupId) => {
        if (media && media.buffer) {
          const base64 = media.buffer.toString('base64');
          const dataUri = `data:${media.mimetype};base64,${base64}`;
          
          if (media.mimetype.startsWith('image/')) {
            await bot.telegram.sendPhoto(groupId, dataUri, { caption: message || '' });
          } else if (media.mimetype.startsWith('video/')) {
            await bot.telegram.sendVideo(groupId, dataUri, { caption: message || '' });
          } else {
            await bot.telegram.sendDocument(groupId, dataUri, { caption: message || '' });
          }
        } else {
          await bot.telegram.sendMessage(groupId, message);
        }
      };

      if (scheduledFor) {
        setTimeout(async () => {
          for (const groupId of groupIds) {
            try { 
              await sendToGroup(groupId); 
            } catch (e) { 
              console.error('[TG] group send error:', e?.message || e); 
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        }, scheduledFor - now);
        return { success: true, message: `Scheduled to ${groupIds.length} group(s) at ${new Date(scheduledFor).toISOString()}` };
      } else {
        for (const groupId of groupIds) {
          await sendToGroup(groupId);
          await new Promise(r => setTimeout(r, 500));
        }
        return { success: true, message: `Sent to ${groupIds.length} group(s)` };
      }
    } catch (e) {
      return { success: false, message: 'Failed to send to groups', error: e.message };
    }
  }

  // ===== Campaign (bulk sending) =====
  async startCampaign(userId, rows, messageTemplate, throttleMs = 3000, media = null) {
    try {
      const bot = this.userBots.get(userId);
      if (!bot) return { success: false, message: 'Bot not connected' };
      
      let sent = 0, failed = 0;
      for (const row of rows) {
        const chatId = String(row.chatId || row.telegram_id || '');
        if (!chatId) { failed++; continue; }
        
        const personalized = String(row.message || messageTemplate || '').replace(/\{\{name\}\}/gi, row.name || '');
        let ok = false;
        
        if (media && media.buffer) {
          const base64 = media.buffer.toString('base64');
          const dataUri = `data:${media.mimetype};base64,${base64}`;
          
          try {
            if (media.mimetype.startsWith('image/')) {
              await bot.telegram.sendPhoto(chatId, dataUri, { caption: personalized || '' });
            } else if (media.mimetype.startsWith('video/')) {
              await bot.telegram.sendVideo(chatId, dataUri, { caption: personalized || '' });
            } else {
              await bot.telegram.sendDocument(chatId, dataUri, { caption: personalized || '' });
            }
            ok = true;
          } catch (e) {
            ok = false;
          }
        } else {
          ok = await this.sendMessage(userId, chatId, personalized || '');
        }
        
        if (ok) sent++; else failed++;
        await new Promise(r => setTimeout(r, throttleMs));
      }
      return { success: true, summary: { sent, failed, total: rows.length } };
    } catch (e) {
      return { success: false, message: 'Campaign failed', error: e.message };
    }
  }

  async getBotInfo(userId) {
    try {
      const account = await TelegramAccount.findOne({ where: { userId, isActive: true } });
      if (!account) {
        return { success: false, message: 'No active bot found' };
      }

      const bot = this.userBots.get(userId);
      if (!bot) {
        return { success: false, message: 'Bot not connected' };
      }

      const botInfo = await bot.telegram.getMe();
      return {
        success: true,
        botInfo: {
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name,
          can_join_groups: botInfo.can_join_groups,
          can_read_all_group_messages: botInfo.can_read_all_group_messages
        }
      };
    } catch (error) {
      return { success: false, message: 'Failed to get bot info', error: error.message };
    }
  }
}

// Export singleton instance
module.exports = new TelegramService();