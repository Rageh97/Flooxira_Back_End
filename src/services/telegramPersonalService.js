const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const { TelegramSession } = require('../models/telegramSession');
const { KnowledgeBase } = require('../models/knowledgeBase');
const { TelegramChat } = require('../models/telegramChat');
const { sequelize } = require('../sequelize');
const Fuse = require('fuse.js');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class TelegramPersonalService {
  constructor() {
    this.userClients = new Map(); // userId -> TelegramClient
    this.qrCodes = new Map(); // userId -> dataURL
  }

  async startSession(userId) {
    try {
      // Retrieve existing session
      const row = await TelegramSession.findOne({ where: { userId, isActive: true }, order: [['updatedAt', 'DESC']] });
      const sessionStr = row?.sessionString || '';
      const stringSession = new StringSession(sessionStr);

      const apiId = parseInt(process.env.TG_API_ID || '0');
      const apiHash = process.env.TG_API_HASH || '';
      if (!apiId || !apiHash) {
        return { success: false, message: 'Missing TG_API_ID or TG_API_HASH in environment' };
      }

      const client = new TelegramClient(stringSession, apiId, apiHash, { connectionRetries: 5 });

      // Start with only QR handler (no phoneNumber), do not await to avoid blocking
      const startPromise = client.start({
        phoneNumber: async () => undefined,
        phoneCode: async () => undefined,
        password: async () => undefined,
        qrCode: async (code) => {
          try {
            const dataUrl = await QRCode.toDataURL(code);
            this.qrCodes.set(userId, dataUrl);
            console.log(`\n[TG Personal] QR for user ${userId}`);
            qrcodeTerminal.generate(code, { small: true });
          } catch (e) {
            console.error('[TG Personal] QR generation error:', e?.message || e);
          }
        },
        onError: (err) => console.error('[TG Personal] start error:', err)
      });

      // When login completes, persist session
      startPromise.then(async () => {
        try {
          const newString = client.session.save();
          if (row) {
            row.sessionString = newString;
            row.isActive = true;
            await row.save();
          } else {
            await TelegramSession.create({ userId, sessionString: newString, isActive: true });
          }
          this.userClients.set(userId, client);
          this.qrCodes.delete(userId);
          this.attachMessageHandler(userId, client);
        } catch (e) {
          console.error('[TG Personal] save session error:', e?.message || e);
        }
      }).catch((e) => {
        console.error('[TG Personal] start() error:', e?.message || e);
      });

      // Give QR a moment to generate
      await new Promise(r => setTimeout(r, 500));
      return { success: true, status: 'qr_generated', qrCode: this.qrCodes.get(userId) || null };
    } catch (e) {
      console.error('[TG Personal] startSession error:', e);
      return { success: false, message: 'Failed to start Telegram session', error: e.message };
    }
  }

  async getQRCode(userId) {
    return this.qrCodes.get(userId) || null;
  }

  async getStatus(userId) {
    try {
      const client = this.userClients.get(userId);
      if (client) {
        return { success: true, status: 'CONNECTED', message: 'Telegram session is active' };
      }
      const row = await TelegramSession.findOne({ where: { userId, isActive: true } });
      if (row?.sessionString) return { success: true, status: 'INITIALIZED', message: 'Session saved. Connect client' };
      return { success: true, status: 'disconnected', message: 'No active Telegram session' };
    } catch (e) {
      return { success: false, status: 'error', message: e.message };
    }
  }

  async stopSession(userId) {
    try {
      const client = this.userClients.get(userId);
      if (client) {
        await client.disconnect();
      }
      this.userClients.delete(userId);
      this.qrCodes.delete(userId);
      await TelegramSession.update({ isActive: false }, { where: { userId } });
      return { success: true, message: 'Telegram session stopped' };
    } catch (e) {
      return { success: false, message: 'Failed to stop session', error: e.message };
    }
  }

  async sendMessage(userId, to, message) {
    try {
      let client = this.userClients.get(userId);
      if (!client) {
        const row = await TelegramSession.findOne({ where: { userId, isActive: true }, order: [['updatedAt', 'DESC']] });
        if (!row?.sessionString) return false;
        const apiId = parseInt(process.env.TG_API_ID || '0');
        const apiHash = process.env.TG_API_HASH || '';
        client = new TelegramClient(new StringSession(row.sessionString), apiId, apiHash, { connectionRetries: 5 });
        await client.connect();
        this.userClients.set(userId, client);
      }
      await client.sendMessage(to, { message });
      return true;
    } catch (e) {
      console.error('[TG Personal] sendMessage error:', e?.message || e);
      return false;
    }
  }

  attachMessageHandler(userId, client) {
    try {
      client.addEventHandler(async (event) => {
        try {
          const msg = event.message;
          if (!msg || msg.out) return; // only incoming
          const chat = await msg.getChat();
          const chatId = String(chat?.id || msg.peerId?.channelId || msg.peerId?.chatId || msg.peerId?.userId || '');
          const chatTitle = chat?.title || chat?.firstName || chat?.username || 'Unknown';
          const chatType = chat?.className && String(chat.className).toLowerCase().includes('channel')
            ? 'channel'
            : (chat?.className && String(chat.className).toLowerCase().includes('chat'))
              ? 'group'
              : 'private';
          const text = msg.message || '';

          await this.logChatMessage(userId, chatId, chatType, chatTitle, 'incoming', text, String(msg.id), null, null);

          // Knowledge base / OpenAI
          let response = '';
          let responseSource = 'fallback';
          let knowledgeBaseMatch = null;
          const knowledgeEntries = await KnowledgeBase.findAll({ where: { userId, isActive: true } });
          if (knowledgeEntries.length) {
            const fuse = new Fuse(knowledgeEntries, { keys: ['keyword'], threshold: 0.6, includeScore: true });
            const results = fuse.search(text);
            if (results.length > 0 && results[0].score < 0.6) {
              response = results[0].item.answer;
              responseSource = 'knowledge_base';
              knowledgeBaseMatch = results[0].item.keyword;
            }
          }
          if (!response) {
            try {
              const completion = await openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: 'You are a helpful Telegram assistant. Keep responses under 200 characters.' },
                  { role: 'user', content: text || 'Hello' }
                ],
                max_tokens: 150
              });
              response = completion.choices?.[0]?.message?.content || '';
              responseSource = 'openai';
            } catch (e) {
              response = 'نحن الان في وضع التطوير سستتحسن التجربة قريبا...';
              responseSource = 'fallback';
            }
          }
          if (!response) {
            response = text ? `Echo: ${text}` : 'Hello! How can I help you today?';
            responseSource = 'fallback';
          }

          await new Promise(r => setTimeout(r, 2000));
          await client.sendMessage(chatId, { message: response });
          await this.logChatMessage(userId, chatId, chatType, chatTitle, 'outgoing', response, null, responseSource, knowledgeBaseMatch);
        } catch (err) {
          console.error('[TG Personal] message handler error:', err?.message || err);
        }
      }, new NewMessage({}));
    } catch (e) {
      console.error('[TG Personal] attachMessageHandler failed:', e?.message || e);
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

  async getChatHistory(userId, chatId = null, limit = 50, offset = 0) {
    try {
      const whereClause = { userId };
      if (chatId) whereClause.chatId = chatId;
      const chats = await TelegramChat.findAll({ where: whereClause, order: [['timestamp', 'DESC']], limit, offset });
      return {
        success: true,
        chats: chats.map(c => ({
          id: c.id,
          chatId: c.chatId,
          chatType: c.chatType,
          chatTitle: c.chatTitle,
          messageType: c.messageType,
          messageContent: c.messageContent,
          responseSource: c.responseSource,
          knowledgeBaseMatch: c.knowledgeBaseMatch,
          timestamp: c.timestamp
        }))
      };
    } catch (e) {
      return { success: false, message: 'Failed to get chat history', error: e.message };
    }
  }

  async getChatContacts(userId) {
    try {
      const contacts = await TelegramChat.findAll({
        where: { userId },
        attributes: [
          'chatId', 'chatType', 'chatTitle',
          [sequelize.fn('COUNT', sequelize.col('id')), 'messageCount'],
          [sequelize.fn('MAX', sequelize.col('timestamp')), 'lastMessageTime']
        ],
        group: ['chatId', 'chatType', 'chatTitle'],
        order: [[sequelize.fn('MAX', sequelize.col('timestamp')), 'DESC']]
      });
      return { success: true, contacts: contacts.map(c => ({
        chatId: c.chatId,
        chatType: c.chatType,
        chatTitle: c.chatTitle,
        messageCount: parseInt(c.dataValues.messageCount),
        lastMessageTime: c.dataValues.lastMessageTime
      })) };
    } catch (e) {
      return { success: false, message: 'Failed to get chat contacts', error: e.message };
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
      const totalContacts = await TelegramChat.count({ where: { userId }, distinct: true, col: 'chatId' });
      return { success: true, stats: {
        totalMessages: parseInt(stats[0].totalMessages) || 0,
        incomingMessages: parseInt(stats[0].incomingMessages) || 0,
        outgoingMessages: parseInt(stats[0].outgoingMessages) || 0,
        totalContacts,
        knowledgeBaseResponses: parseInt(stats[0].knowledgeBaseResponses) || 0,
        openaiResponses: parseInt(stats[0].openaiResponses) || 0,
        fallbackResponses: parseInt(stats[0].fallbackResponses) || 0
      }};
    } catch (e) {
      return { success: false, message: 'Failed to get bot stats', error: e.message };
    }
  }

  async listGroups(userId) {
    try {
      let client = this.userClients.get(userId);
      if (!client) {
        const row = await TelegramSession.findOne({ where: { userId, isActive: true }, order: [['updatedAt', 'DESC']] });
        if (!row?.sessionString) return { success: false, message: 'Client not connected' };
        const apiId = parseInt(process.env.TG_API_ID || '0');
        const apiHash = process.env.TG_API_HASH || '';
        client = new TelegramClient(new StringSession(row.sessionString), apiId, apiHash, { connectionRetries: 5 });
        await client.connect();
        this.userClients.set(userId, client);
      }
      const dialogs = await client.getDialogs({});
      const groups = dialogs
        .filter(d => d.isGroup || d.isChannel)
        .map(d => ({ id: String(d.id), name: d.title || String(d.id), type: d.isChannel ? 'channel' : 'group', participantsCount: 0 }));
      return { success: true, groups };
    } catch (e) {
      return { success: false, message: 'Failed to list groups', error: e.message };
    }
  }
}

module.exports = new TelegramPersonalService();

