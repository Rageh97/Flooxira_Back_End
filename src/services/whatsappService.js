const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrcode = require('qrcode-terminal');
const { KnowledgeBase } = require('../models/knowledgeBase');
const { WhatsappChat } = require('../models/whatsappChat');
const { User } = require('../models/user');
const { sequelize } = require('../sequelize');
const Fuse = require('fuse.js');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class WhatsAppService {
  constructor() {
    this.userClients = new Map();
    this.userStates = new Map();
    this.messageCounters = new Map();
    this.qrCodes = new Map(); // Store QR codes for each user
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
        reason.message.includes('LocalAuth') ||
        reason.message.includes('chrome_debug.log') ||
        reason.message.includes('Cookies') ||
        reason.message.includes('unlink')
      )) {
        return;
      }
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      if (error && error.message && (
        error.message.includes('EBUSY') ||
        error.message.includes('resource busy or locked') ||
        error.message.includes('LocalAuth') ||
        error.message.includes('chrome_debug.log') ||
        error.message.includes('Cookies') ||
        error.message.includes('unlink')
      )) {
        return;
      }
      console.error('Uncaught Exception:', error);
    });
  }

  async startSession(userId, options = {}) {
    try {
      // Check if already initializing
      const state = this.userStates.get(userId);
      if (state?.initializing) {
        return {
          success: true,
          message: 'WhatsApp session is already initializing',
          qrCode: this.qrCodes.get(userId) || null,
          status: this.qrCodes.get(userId) ? 'qr_generated' : 'initializing'
        };
      }

      // Check if user already has an active session
      if (this.userClients.has(userId)) {
        const existingClient = this.userClients.get(userId);
        try {
          const clientState = await existingClient.getState();
          if (clientState === 'CONNECTED') {
            return {
              success: true,
              message: 'WhatsApp session already active',
              qrCode: null,
              status: 'connected'
            };
          }
        } catch (error) {
          console.log(`[WA] Could not get state for existing client, recreating: ${error.message}`);
          this.userClients.delete(userId);
        }
      }

      // Set initializing state and reset message counter
      this.userStates.set(userId, { initializing: true, reconnecting: false });
      this.messageCounters.set(userId, 0);

      // Create WhatsApp client with enhanced configuration
      const sessionId = `user_${userId}_${Date.now()}`;
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: `./data/wa-auth/${sessionId}`
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-logging',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-images',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-blink-features=AutomationControlled',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-first-run',
            '--safebrowsing-disable-auto-update',
            '--disable-ipc-flooding-protection'
          ],
          timeout: 60000,
          handleSIGINT: false,
          handleSIGTERM: false,
          handleSIGHUP: false
        },
        restartOnAuthFail: false,
        takeoverOnConflict: false,
        takeoverTimeoutMs: 0,
        authTimeoutMs: 0
      });

      let qrCodeData = null;

      // Enhanced QR code handling
      client.on('qr', async (qr) => {
        try {
          qrCodeData = await QRCode.toDataURL(qr);
          this.qrCodes.set(userId, qrCodeData);
          
          // Also generate terminal QR for debugging
          console.log(`\n[WA] QR Code for user ${userId}:`);
          qrcode.generate(qr, { small: true });
          
          console.log(`QR Code generated for user ${userId}`);
        } catch (err) {
          console.error('QR Code generation failed:', err);
        }
      });

      client.on('ready', () => {
        console.log(`WhatsApp client ready for user ${userId}`);
        this.userClients.set(userId, client);
        const s = this.userStates.get(userId) || {};
        s.initializing = false;
        s.ready = true;
        this.userStates.set(userId, s);
        
        // Clear QR code once connected
        this.qrCodes.delete(userId);
        
        this.setupKeepAlive(userId, client);
      });

      client.on('authenticated', () => {
        console.log(`WhatsApp client authenticated for user ${userId}`);
      });

      client.on('auth_failure', (msg) => {
        console.error(`WhatsApp auth failure for user ${userId}:`, msg);
        this.userClients.delete(userId);
        this.qrCodes.delete(userId);
        const s = this.userStates.get(userId) || {};
        s.initializing = false;
        this.userStates.set(userId, s);
      });

      client.on('disconnected', (reason) => {
        console.log(`WhatsApp client disconnected for user ${userId}:`, reason);
        this.handleDisconnection(userId, reason);
      });

      client.on('change_state', (state) => {
        console.log(`[WA] state changed for user ${userId}:`, state);
      });

      // Enhanced message handling with auto-response
      client.on('message', async (message) => {
        // Allow self-testing: if the message is from the same account to itself, process it
        if (message.fromMe) {
          try {
            const currentClient = this.userClients.get(userId);
            const selfId = currentClient?.info?.wid?._serialized;
            // Only process when user messages themselves; ignore other fromMe events
            if (!selfId || message.to !== selfId) {
              return;
            }
          } catch {
            return;
          }
        }
        
        if (message.body === 'ping') {
          console.log(`[WA] Ping message received from ${message.from}, ignoring`);
          return;
        }
        
        console.log(`[WA] message from ${message.from}:`, message.body?.slice(0, 80));
        
        try {
          await this.handleIncomingMessage(message, userId);
        } catch (error) {
          console.error(`[WA] Error handling message for user ${userId}:`, error);
        }
      });

      // Initialize the client
      await client.initialize();

      // Wait for QR code generation
      await new Promise(resolve => setTimeout(resolve, 2000));

      return {
        success: true,
        message: 'WhatsApp session started',
        qrCode: qrCodeData,
        status: 'qr_generated'
      };

    } catch (error) {
      console.error('WhatsApp session start error:', error);
      const s = this.userStates.get(userId) || {};
      s.initializing = false;
      this.userStates.set(userId, s);
      return {
        success: false,
        message: 'Failed to start WhatsApp session',
        error: error.message
      };
    }
  }

  setupKeepAlive(userId, client) {
    // Set up continuous activity to prevent session timeout
    const keepAliveInterval = setInterval(async () => {
      try {
        if (!this.userClients.has(userId)) {
          console.log(`[WA] Client no longer exists for user ${userId}, stopping keep-alive`);
          clearInterval(keepAliveInterval);
          return;
        }
        
        if (client && client.info && client.info.wid) {
          const messageCount = this.messageCounters.get(userId) || 0;
          console.log(`[WA] Keep-alive check for user ${userId} - still connected (${messageCount} messages processed)`);
          
          try {
            const state = await client.getState();
            if (state === 'CONNECTED') {
              console.log(`[WA] Session active for user ${userId}`);
            } else {
              console.log(`[WA] Session not connected for user ${userId}, state: ${state}`);
              clearInterval(keepAliveInterval);
            }
          } catch (stateError) {
            console.log(`[WA] State check failed for user ${userId}, stopping keep-alive`);
            clearInterval(keepAliveInterval);
          }
        }
      } catch (error) {
        console.log(`[WA] Keep-alive check failed for user ${userId}:`, error.message);
        clearInterval(keepAliveInterval);
      }
    }, 10000);

    // Store the interval ID for cleanup
    const s = this.userStates.get(userId) || {};
    s.keepAliveInterval = keepAliveInterval;
    this.userStates.set(userId, s);
  }

  handleDisconnection(userId, reason) {
    this.userClients.delete(userId);
    this.qrCodes.delete(userId);
    const s = this.userStates.get(userId) || {};
    s.initializing = false;
    s.ready = false;
    
    // Clear keep-alive interval
    if (s.keepAliveInterval) {
      clearInterval(s.keepAliveInterval);
      s.keepAliveInterval = null;
    }
    
    this.userStates.set(userId, s);
    
    // Auto-reconnect after 5 seconds
    if (!this.userStates.get(userId)?.reconnecting) {
      const s = this.userStates.get(userId) || {};
      s.reconnecting = true;
      this.userStates.set(userId, s);
      
      setTimeout(() => {
        if (!this.userClients.has(userId)) {
          console.log(`[WA] Auto-reconnecting user ${userId} after disconnect...`);
          try {
            this.startSession(userId);
          } catch (reconnectError) {
            console.log(`[WA] Reconnection failed for user ${userId}:`, reconnectError.message);
            const s = this.userStates.get(userId) || {};
            s.reconnecting = false;
            this.userStates.set(userId, s);
          }
        }
      }, 5000);
    }
    
    // Clean up session files
    setTimeout(() => {
      this.cleanupSessionFiles(userId);
    }, 10000);
  }

  cleanupSessionFiles(userId) {
    try {
      const waAuthDir = './data/wa-auth';
      if (fs.existsSync(waAuthDir)) {
        const entries = fs.readdirSync(waAuthDir);
        entries.forEach(entry => {
          if (entry.startsWith(`user_${userId}_`)) {
            const sessionPath = path.join(waAuthDir, entry);
            try {
              fs.rmSync(sessionPath, { recursive: true, force: true });
              console.log(`[WA] Cleaned up session files: ${entry}`);
            } catch (cleanupError) {
              // Silently ignore cleanup errors
            }
          }
        });
      }
    } catch (cleanupError) {
      // Silently ignore cleanup errors
    }
  }

  async handleIncomingMessage(message, userId) {
    try {
      // Track message count
      const currentCount = this.messageCounters.get(userId) || 0;
      this.messageCounters.set(userId, currentCount + 1);
      
      console.log(`[WA] Processing message #${currentCount + 1} from ${message.from}: ${message.body}`);
      
      // Log incoming message
      await this.logChatMessage(userId, message.from, 'incoming', message.body, null, null);
      
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

        const results = fuse.search(message.body);
        
        if (results.length > 0 && results[0].score < 0.6) {
          response = results[0].item.answer;
          responseSource = 'knowledge_base';
          knowledgeBaseMatch = results[0].item.keyword;
          console.log(`[WA] Found knowledge base match: ${results[0].item.keyword}`);
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
                content: "You are a helpful WhatsApp bot assistant. Provide concise, helpful responses to user queries. Keep responses under 160 characters when possible. If you don't know something, politely say you don't have that information."
              },
              {
                role: "user",
                content: message.body
              }
            ],
            max_tokens: 150
          });
          response = completion.choices[0].message.content;
          responseSource = 'openai';
        } catch (openaiError) {
          console.error('OpenAI error:', openaiError);
          response = "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
          responseSource = 'fallback';
        }
      }

      // Final fallback response
      if (!response) {
        if (message.body && message.body.trim()) {
          response = `Echo: ${message.body.trim()}`;
        } else {
          response = 'Hello! How can I help you today?';
        }
        responseSource = 'fallback';
      }

      // Send response and log it
      if (response) {
        await this.sendMessage(userId, message.from, response);
        await this.logChatMessage(userId, message.from, 'outgoing', response, responseSource, knowledgeBaseMatch);
      }

    } catch (error) {
      console.error('Message handling error:', error);
    }
  }

  async logChatMessage(userId, contactNumber, messageType, messageContent, responseSource, knowledgeBaseMatch) {
    try {
      await WhatsappChat.create({
        userId,
        contactNumber,
        messageType,
        messageContent,
        responseSource,
        knowledgeBaseMatch,
        isProcessed: true
      });
    } catch (error) {
      console.error('Error logging chat message:', error);
    }
  }

  async sendMessage(userId, to, message) {
    try {
      const client = this.userClients.get(userId);
      if (!client) {
        console.log(`[WA] No client available for user ${userId}`);
        return false;
      }

      // Prefer to be connected, but if state check fails we will still attempt to send
      try {
        const state = await client.getState();
        if (state !== 'CONNECTED') {
          console.log(`[WA] Client state is ${state} for user ${userId}; will attempt send anyway.`);
        }
      } catch (e) {
        console.log(`[WA] Could not verify client state before sending for user ${userId}:`, e?.message || e);
      }

      // Resolve destination chat id
      let chatId = to;
      if (!String(to).includes('@')) {
        const digits = String(to).replace(/\D/g, '');
        if (!digits) {
          console.log('[WA] Invalid destination number provided');
          return false;
        }
        try {
          const numberId = await client.getNumberId(digits);
          if (!numberId) {
            console.log(`[WA] Number ${digits} is not a valid WhatsApp user`);
            return false;
          }
          chatId = numberId._serialized; // e.g. 15551234567@c.us
        } catch (resolveErr) {
          console.log(`[WA] Failed to resolve numberId for ${digits}:`, resolveErr?.message || resolveErr);
          return false;
        }
      }

      const attemptSend = async () => {
        await client.sendMessage(chatId, message);
        console.log(`[WA] Message sent successfully to ${chatId}`);
      };

      try {
        await attemptSend();
        return true;
      } catch (sendErr) {
        console.log(`[WA] First send attempt failed to ${chatId}:`, sendErr?.message || sendErr);
        // Retry once after short delay
        await new Promise(r => setTimeout(r, 500));
        try {
          await attemptSend();
          return true;
        } catch (retryErr) {
          console.log(`[WA] Retry send failed to ${chatId}:`, retryErr?.message || retryErr);
          return false;
        }
      }
    } catch (error) {
      console.error(`[WA] Send message failed:`, error);
      return false;
    }
  }

  async getStatus(userId) {
    const client = this.userClients.get(userId);
    const state = this.userStates.get(userId);

    if (!client) {
      return {
        success: true,
        status: 'disconnected',
        message: 'No active WhatsApp session'
      };
    }

    try {
      const clientState = await client.getState();
      return {
        success: true,
        status: clientState,
        message: clientState === 'CONNECTED' ? 'WhatsApp session is active' : 'WhatsApp session is not ready',
        initializing: state?.initializing || false
      };
    } catch (error) {
      return {
        success: true,
        status: 'error',
        message: 'Could not determine WhatsApp session status',
        error: error.message
      };
    }
  }

  async getQRCode(userId) {
    return this.qrCodes.get(userId) || null;
  }

  async stopSession(userId) {
    try {
      const client = this.userClients.get(userId);
      if (client) {
        await client.destroy();
      }
      
      this.userClients.delete(userId);
      this.qrCodes.delete(userId);
      
      const s = this.userStates.get(userId) || {};
      s.initializing = false;
      s.ready = false;
      
      if (s.keepAliveInterval) {
        clearInterval(s.keepAliveInterval);
        s.keepAliveInterval = null;
      }
      
      this.userStates.set(userId, s);
      
      return { success: true, message: 'WhatsApp session stopped' };
    } catch (error) {
      console.error('Stop session error:', error);
      return { success: false, message: 'Failed to stop session', error: error.message };
    }
  }

  async getChatHistory(userId, contactNumber = null, limit = 50, offset = 0) {
    try {
      const whereClause = { userId };
      if (contactNumber) {
        whereClause.contactNumber = contactNumber;
      }

      const chats = await WhatsappChat.findAll({
        where: whereClause,
        order: [['timestamp', 'DESC']],
        limit,
        offset
      });

      return {
        success: true,
        chats: chats.map(chat => ({
          id: chat.id,
          contactNumber: chat.contactNumber,
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
      const contacts = await WhatsappChat.findAll({
        where: { userId },
        attributes: [
          'contactNumber',
          [sequelize.fn('COUNT', sequelize.col('id')), 'messageCount'],
          [sequelize.fn('MAX', sequelize.col('timestamp')), 'lastMessageTime']
        ],
        group: ['contactNumber'],
        order: [[sequelize.fn('MAX', sequelize.col('timestamp')), 'DESC']]
      });

      return {
        success: true,
        contacts: contacts.map(contact => ({
          contactNumber: contact.contactNumber,
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
      const stats = await WhatsappChat.findAll({
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

      const totalContacts = await WhatsappChat.count({
        where: { userId },
        distinct: true,
        col: 'contactNumber'
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
}

// Export singleton instance
module.exports = new WhatsAppService();
