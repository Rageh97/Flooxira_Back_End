const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, downloadMediaMessage, jidNormalizedUser, delay } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { KnowledgeBase } = require('../models/knowledgeBase');
const { WhatsappChat } = require('../models/whatsappChat');
const { User } = require('../models/user');
const { sequelize } = require('../sequelize');
const Fuse = require('fuse.js');
const OpenAI = require('openai');
let GoogleGenerativeAI;
try { GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI; } catch (_) { GoogleGenerativeAI = null; }
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const { searchOrAnswer } = require('../services/botSearchService');
const limitService = require('./limitService');
const conversationService = require('./conversationService');
const { WhatsappTemplate, WhatsappTemplateButton } = require('../models/whatsappTemplate');
const { BotSettings } = require('../models/botSettings');
const pino = require('pino');

// OpenAI client (conditional)
let openai = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (_) {
  openai = null;
}

// Gemini client (conditional)
let geminiModel = null;
try {
  if (GoogleGenerativeAI && process.env.GOOGLE_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const requested = process.env.GEMINI_MODEL || '';
    const sdkModelId = (requested && requested.startsWith('models/')) ? requested.split('/').pop() : (requested || 'gemini-2.5-flash');
    try {
      geminiModel = genAI.getGenerativeModel({ model: sdkModelId });
      console.log('[Baileys] Using Gemini model:', sdkModelId);
    } catch (_) {
      geminiModel = null;
    }
  }
} catch (_) {
  geminiModel = null;
}

async function callGeminiHTTP(model, prompt) {
  const fetch = require('node-fetch');
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`;
  const body = {
    contents: [
      { role: 'user', parts: [{ text: prompt }] }
    ]
  };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini HTTP ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text?.trim();
}

class BaileysService {
  constructor() {
    // Maps to store user sockets and states
    this.userSockets = new Map();
    this.userStates = new Map();
    this.messageCounters = new Map();
    this.qrCodes = new Map();
    this.conversationLocks = new Map();
    this.lastMessageTime = new Map();
    this.initializationLocks = new Map();
    
    // Pino logger (quiet mode)
    this.logger = pino({ level: 'silent' });
    
    console.log('[Baileys] 🚀 BaileysService initialized');
  }

  // ==================== SESSION MANAGEMENT ====================

  async isWithinWorkingHours(userId) {
    try {
      const settings = await BotSettings.findOne({ where: { userId } });
      
      if (!settings || !settings.workingHoursEnabled) {
        return { isWorkingHours: true, message: null };
      }

      const now = new Date();
      const timezone = settings.timezone || 'Asia/Riyadh';
      
      const userTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      const currentDay = userTime.getDay();
      const currentTime = userTime.toTimeString().split(' ')[0];
      
      const workingDays = settings.workingDays || [1, 2, 3, 4, 5];
      if (!workingDays.includes(currentDay)) {
        return { 
          isWorkingHours: false, 
          message: settings.outsideWorkingHoursMessage || 'نعتذر، نحن خارج أوقات العمل. سنرد عليك في أقرب وقت ممكن.'
        };
      }

      const startTime = settings.workingHoursStart || '09:00:00';
      const endTime = settings.workingHoursEnd || '17:00:00';
      
      if (currentTime < startTime || currentTime > endTime) {
        return { 
          isWorkingHours: false, 
          message: settings.outsideWorkingHoursMessage || 'نعتذر، نحن خارج أوقات العمل. سنرد عليك في أقرب وقت ممكن.'
        };
      }

      return { isWorkingHours: true, message: null };
    } catch (error) {
      console.error('[Baileys] Error checking working hours:', error);
      return { isWorkingHours: true, message: null };
    }
  }

  async startSession(userId, options = {}) {
    try {
      console.log(`[Baileys] 🚀 startSession called for user ${userId}`);
      
      // Check initialization lock
      if (this.initializationLocks.has(userId)) {
        console.log(`[Baileys] ⚠️ BLOCKED: Initialization already in progress for user ${userId}`);
        return {
          success: true,
          message: 'WhatsApp session is already initializing',
          qrCode: this.qrCodes.get(userId) || null,
          status: this.qrCodes.get(userId) ? 'qr_generated' : 'initializing'
        };
      }
      
      // Set lock
      this.initializationLocks.set(userId, true);
      console.log(`[Baileys] 🔒 Lock SET for user ${userId}`);
      
      // Clear stopped flag
      const prev = this.userStates.get(userId) || {};
      prev.stopped = false;
      this.userStates.set(userId, prev);

      // Check if already has active session
      if (this.userSockets.has(userId)) {
        console.log(`[Baileys] User ${userId} already has a socket - returning existing session`);
        this.initializationLocks.delete(userId);
        return {
          success: true,
          message: 'WhatsApp session already active',
          qrCode: null,
          status: 'connected'
        };
      }

      // Set initializing state
      this.userStates.set(userId, { initializing: true, reconnecting: false, stopped: false });
      this.messageCounters.set(userId, 0);

      // Create auth directory
      const authPath = path.join(__dirname, '../../data/baileys-auth', `user_${userId}`);
      if (!fs.existsSync(authPath)) {
        fs.mkdirSync(authPath, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: this.logger,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        syncFullHistory: false,
        defaultQueryTimeoutMs: undefined,
        getMessage: async (key) => {
          return { conversation: '' };
        },
        shouldIgnoreJid: (jid) => false,
        emitOwnEvents: false,
        fireInitQueries: true
      });

      let qrCodeData = null;

      // QR Code handler
      sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
          try {
            qrCodeData = await QRCode.toDataURL(qr);
            this.qrCodes.set(userId, qrCodeData);
            console.log(`[Baileys] 📱 QR Code generated for user ${userId}`);
          } catch (err) {
            console.error('[Baileys] QR Code generation failed:', err);
          }
        }
        
        if (connection === 'close') {
          const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          
          console.log(`[Baileys] ⚠️ Connection closed for user ${userId}, code: ${statusCode}`);
          
          // Always release lock on close
          this.initializationLocks.delete(userId);
          console.log(`[Baileys] 🔓 Lock RELEASED for user ${userId} (connection closed)`);
          
          if (statusCode === DisconnectReason.loggedOut) {
            console.error(`[Baileys] 🚨 LOGOUT detected for user ${userId}!`);
            this.handleDisconnection(userId, 'LOGOUT');
          } else if (statusCode === DisconnectReason.badSession || 
                     statusCode === DisconnectReason.restartRequired ||
                     statusCode === 401 || statusCode === 403 || statusCode === 428) {
            console.log(`[Baileys] 🗑️ Bad/expired session for user ${userId}, cleaning up...`);
            this.handleDisconnection(userId, 'BAD_SESSION');
            // Delete session files
            const authPath = path.join(__dirname, '../../data/baileys-auth', `user_${userId}`);
            try {
              if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log(`[Baileys] 🧹 Deleted session files for user ${userId}`);
              }
            } catch (cleanErr) {
              console.log(`[Baileys] Failed to delete session: ${cleanErr.message}`);
            }
          } else if (shouldReconnect) {
            console.log(`[Baileys] 🔄 Will retry connection for user ${userId} in 5 seconds...`);
            setTimeout(() => this.startSession(userId, options), 5000);
          } else {
            this.handleDisconnection(userId, 'DISCONNECTED');
          }
        } else if (connection === 'open') {
          console.log(`[Baileys] ✅ Connection open for user ${userId}`);
          this.userSockets.set(userId, sock);
          const s = this.userStates.get(userId) || {};
          s.initializing = false;
          s.ready = true;
          this.userStates.set(userId, s);
          
          this.qrCodes.delete(userId);
          this.initializationLocks.delete(userId);
          console.log(`[Baileys] 🔓 Lock RELEASED for user ${userId} (ready)`);
          console.log(`[Baileys] 🎉 Session successfully established for user ${userId}`);
        }
      });

      // Save credentials on update
      sock.ev.on('creds.update', saveCreds);
      
      // Message handler
      sock.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          
          try {
            await this.handleIncomingMessage(msg, userId, sock);
          } catch (error) {
            console.error(`[Baileys] Error handling message for user ${userId}:`, error);
          }
        }
      });

      // Wait for QR or connection with timeout
      await delay(3000);
      
      // If no QR after 3 seconds and not connected, something is wrong
      if (!qrCodeData && !this.userSockets.has(userId)) {
        console.log(`[Baileys] ⚠️ No QR generated after 3 seconds for user ${userId}, releasing lock`);
        this.initializationLocks.delete(userId);
      }

      return {
        success: true,
        message: 'WhatsApp session started',
        qrCode: qrCodeData,
        status: qrCodeData ? 'qr_generated' : 'connecting'
      };

    } catch (error) {
      console.error('[Baileys] ❌ Session start error:', error);
      const s = this.userStates.get(userId) || {};
      s.initializing = false;
      this.userStates.set(userId, s);
      
      this.initializationLocks.delete(userId);
      console.log(`[Baileys] 🔓 Lock RELEASED for user ${userId} (error)`);
      
      return {
        success: false,
        message: 'Failed to start WhatsApp session',
        error: error.message
      };
    }
  }

  handleDisconnection(userId, reason) {
    console.log(`[Baileys] 🔌 handleDisconnection called for user ${userId}, reason:`, reason);
    
    this.userSockets.delete(userId);
    this.qrCodes.delete(userId);
    this.initializationLocks.delete(userId);
    
    this.cleanupUserConversations(userId);
    
    const s = this.userStates.get(userId) || {};
    s.initializing = false;
    s.ready = false;
    this.userStates.set(userId, s);
    
    console.log(`[Baileys] Session disconnected for user ${userId}. Manual reconnection required.`);
  }

  cleanupUserConversations(userId) {
    try {
      const locksToDelete = [];
      for (const [key, value] of this.conversationLocks.entries()) {
        if (key.startsWith(`${userId}_`)) {
          locksToDelete.push(key);
        }
      }
      locksToDelete.forEach(key => this.conversationLocks.delete(key));
      
      const timesToDelete = [];
      for (const [key, value] of this.lastMessageTime.entries()) {
        if (key.startsWith(`${userId}_`)) {
          timesToDelete.push(key);
        }
      }
      timesToDelete.forEach(key => this.lastMessageTime.delete(key));
      
      console.log(`[Baileys] Cleaned up ${locksToDelete.length} locks and ${timesToDelete.length} message times for user ${userId}`);
    } catch (error) {
      console.error('[Baileys] Error cleaning up user conversations:', error);
    }
  }

  async stopSession(userId) {
    try {
      const state = this.userStates.get(userId) || {};
      state.stopped = true;
      state.initializing = false;
      state.reconnecting = false;
      this.userStates.set(userId, state);

      const sock = this.userSockets.get(userId);
      if (sock) {
        await sock.logout();
        sock.end();
      }
      
      this.userSockets.delete(userId);
      this.qrCodes.delete(userId);
      this.initializationLocks.delete(userId);
      this.cleanupUserConversations(userId);
      
      const s = this.userStates.get(userId) || {};
      s.initializing = false;
      s.ready = false;
      this.userStates.set(userId, s);
      
      console.log(`[Baileys] 🔓 Lock RELEASED for user ${userId} (session stopped)`);
      
      return { success: true, message: 'WhatsApp session stopped' };
    } catch (error) {
      console.error('[Baileys] Stop session error:', error);
      this.initializationLocks.delete(userId);
      return { success: false, message: 'Failed to stop session', error: error.message };
    }
  }

  // Force clear locks (for debugging/recovery)
  clearLocks(userId = null) {
    if (userId) {
      this.initializationLocks.delete(userId);
      console.log(`[Baileys] 🧹 Cleared lock for user ${userId}`);
    } else {
      this.initializationLocks.clear();
      console.log(`[Baileys] 🧹 Cleared all locks`);
    }
  }

  async getStatus(userId) {
    const sock = this.userSockets.get(userId);
    const state = this.userStates.get(userId);

    if (!sock) {
      return {
        success: true,
        status: 'disconnected',
        message: 'No active WhatsApp session'
      };
    }

    return {
      success: true,
      status: state?.ready ? 'CONNECTED' : 'connecting',
      message: state?.ready ? 'WhatsApp session is active' : 'WhatsApp session is connecting',
      initializing: state?.initializing || false
    };
  }

  async getQRCode(userId) {
    const qrCode = this.qrCodes.get(userId);
    console.log(`[Baileys] getQRCode for user ${userId}:`, qrCode ? 'QR EXISTS' : 'NO QR');
    
    if (qrCode) {
      return {
        success: true,
        qrCode: qrCode,
        message: 'QR Code available'
      };
    }
    
    return {
      success: true,
      qrCode: null,
      message: 'No QR Code available. Please start a new session.'
    };
  }

  // ==================== MESSAGE HANDLING ====================

  async handleIncomingMessage(message, userId, sock) {
    let conversationKey = null;
    
    try {
      const from = message.key.remoteJid;
      if (!from) return;
      
      conversationKey = `${userId}_${from}`;
      const now = Date.now();
      
      // Check conversation lock
      if (this.conversationLocks.has(conversationKey)) {
        console.log(`[Baileys] Conversation ${conversationKey} is locked, ignoring`);
        return;
      }
      
      // Check rapid messages
      const lastTime = this.lastMessageTime.get(conversationKey) || 0;
      if (now - lastTime < 3000) {
        console.log(`[Baileys] Rapid message from ${conversationKey}, ignoring`);
        return;
      }
      
      this.lastMessageTime.set(conversationKey, now);
      this.conversationLocks.set(conversationKey, true);
      
      setTimeout(() => {
        this.conversationLocks.delete(conversationKey);
      }, 5000);
      
      // Extract message text
      const messageText = message.message?.conversation || 
                         message.message?.extendedTextMessage?.text || 
                         message.message?.imageMessage?.caption ||
                         message.message?.videoMessage?.caption || '';
      
      console.log(`[Baileys] Processing message from ${from}: ${messageText}`);
      
      // Save incoming message
      await conversationService.saveMessage(userId, from, 'incoming', messageText);
      
      // Check bot pause
      const user = await User.findByPk(userId);
      if (user && user.botPaused) {
        if (user.botPausedUntil && new Date() > user.botPausedUntil) {
          await user.update({ botPaused: false, botPausedUntil: null });
          console.log(`[Baileys] Bot resumed for user ${userId} - pause expired`);
        } else {
          console.log(`[Baileys] Bot is paused for user ${userId}`);
          this.conversationLocks.delete(conversationKey);
          return;
        }
      }

      // Check working hours
      const workingHoursCheck = await this.isWithinWorkingHours(userId);
      if (!workingHoursCheck.isWorkingHours) {
        console.log(`[Baileys] Outside working hours for user ${userId}`);
        try {
          await sock.sendMessage(from, { text: workingHoursCheck.message });
          await conversationService.saveMessage(userId, from, 'outgoing', workingHoursCheck.message, 'working_hours');
        } catch (error) {
          console.error(`[Baileys] Failed to send working hours message:`, error);
        }
        this.conversationLocks.delete(conversationKey);
        return;
      }
      
      // Check for template triggers
      const templateResponse = await this.checkTemplateTriggers(userId, messageText, from);
      if (templateResponse === 'TEMPLATE_SENT') {
        await this.logChatMessage(userId, from, 'outgoing', 'Interactive template sent', 'template', null);
        this.conversationLocks.delete(conversationKey);
        return;
      } else if (templateResponse) {
        await this.sendMessage(userId, from, templateResponse);
        this.conversationLocks.delete(conversationKey);
        return;
      }

      // Check if message is a button selection
      const buttonNumber = parseInt(messageText.trim());
      if (!isNaN(buttonNumber) && buttonNumber > 0 && buttonNumber <= 10) {
        const buttonResponse = await this.handleTemplateButtonSelection(userId, from, buttonNumber);
        if (buttonResponse) {
          await this.sendMessage(userId, from, buttonResponse);
          this.conversationLocks.delete(conversationKey);
          return;
        }
      }
      
      let response = '';
      let responseSource = 'fallback';
      let knowledgeBaseMatch = null;
      
      // Try bot search service
      try {
        console.log(`[Baileys] BotData search start for user ${userId}...`);
        const result = await searchOrAnswer(userId, messageText, 0.5, 3, from, null);
        
        if (result?.source === 'fuse' && Array.isArray(result.matches) && result.matches.length) {
          const top = result.matches[0];
          const data = top.data || {};
          
          const name = data['اسم_المنتج'] || data['product_name'] || data['name'] || data['الاسم'] || data['اسم'] || '';
          const price = data['السعر'] || data['price'] || data['سعر'] || '';
          const category = data['الفئة'] || data['category'] || data['فئة'] || '';
          const desc = data['الوصف'] || data['description'] || data['وصف'] || data['تفاصيل'] || data['details'] || '';
          const brand = data['الماركة'] || data['brand'] || data['ماركة'] || '';
          const warranty = data['الضمان'] || data['warranty'] || data['ضمان'] || '';
          const stock = data['المخزون'] || data['stock'] || data['مخزون'] || '';
          
          let productDetails = '';
          if (name) productDetails += `📱 المنتج: ${name}\n\n`;
          if (price) productDetails += `💰 السعر: ${price} ريال سعودي\n\n`;
          if (category) productDetails += `📂 الفئة: ${category}\n\n`;
          if (brand) productDetails += `🏷️ الماركة: ${brand}\n\n`;
          if (desc) productDetails += `📝 الوصف: ${String(desc).slice(0, 300)}\n\n`;
          if (warranty) productDetails += `🛡️ الضمان: ${warranty}\n\n`;
          if (stock) productDetails += `📦 المخزون: ${stock}\n\n`;
          
          Object.entries(data).forEach(([key, value]) => {
            if (value && String(value).trim() !== '' && 
                !['اسم_المنتج', 'product_name', 'name', 'الاسم', 'اسم', 'السعر', 'price', 'سعر', 
                  'الفئة', 'category', 'فئة', 'الوصف', 'description', 'وصف', 'تفاصيل', 'details',
                  'الماركة', 'brand', 'ماركة', 'الضمان', 'warranty', 'ضمان', 'المخزون', 'stock', 'مخزون'].includes(key)) {
              productDetails += `${key}: ${value}\n`;
            }
          });
          
          response = productDetails;
          responseSource = 'knowledge_base';
          knowledgeBaseMatch = name || 'منتج';
        } else if (result?.source === 'direct' && result.answer) {
          response = result.answer;
          responseSource = 'knowledge_base';
        } else if (result?.source === 'summary' && result.answer) {
          response = `أكيد! هذه نظرة سريعة على بعض المنتجات لدينا 👇\n${result.answer}`;
          responseSource = 'knowledge_base';
        } else if (result?.source === 'small_talk' && result.answer) {
          response = result.answer;
          responseSource = 'small_talk';
        } else if (result?.source === 'openai' && result.answer) {
          response = result.answer;
          responseSource = 'openai';
        } else if (result?.source === 'gemini' && result.answer) {
          response = result.answer;
          responseSource = 'gemini';
        }
      } catch (e) {
        console.log('[Baileys] searchOrAnswer failed, will continue with legacy KB/OpenAI flow');
      }

      // Legacy knowledge base
      if (!response) {
        const knowledgeEntries = await KnowledgeBase.findAll({ where: { userId, isActive: true } });
        if (knowledgeEntries.length > 0) {
          const fuse = new Fuse(knowledgeEntries, { keys: ['keyword'], threshold: 0.6, includeScore: true });
          const results = fuse.search(messageText);
          if (results.length > 0 && results[0].score < 0.6) {
            response = results[0].item.answer;
            responseSource = 'knowledge_base';
            knowledgeBaseMatch = results[0].item.keyword;
          }
        }
      }

      // LLM fallback
      if (!response) {
        try {
          const userSettings = await BotSettings.findOne({ where: { userId } });
          
          let systemPrompt = "أنت مساعد ذكي لخدمة العملاء.";
          
          if (userSettings) {
            if (userSettings.personality === 'professional') {
              systemPrompt += " استخدم أسلوب مهني ورسمي.";
            } else if (userSettings.personality === 'friendly') {
              systemPrompt += " استخدم أسلوب ودود ومرح.";
            } else if (userSettings.personality === 'marketing') {
              systemPrompt += " ركز على البيع والإقناع.";
            }
            
            if (userSettings.language === 'arabic') {
              systemPrompt += " استخدم اللغة العربية فقط.";
            } else if (userSettings.language === 'english') {
              systemPrompt += " استخدم اللغة الإنجليزية فقط.";
            }
            
            if (userSettings.includeEmojis) {
              systemPrompt += " استخدم الإيموجي في الردود.";
            }
          }
          
          systemPrompt += " إذا لم تجد المنتج/الخدمة المطلوبة، اعتذر وأخبره أن الخدمة ستتوفر قريباً. كن مختصراً واحترافياً.";
          
          if (openai) {
            const completion = await openai.chat.completions.create({
              model: "gpt-4o",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: messageText }
              ],
              max_tokens: 150
            });
            response = completion.choices[0].message.content;
            responseSource = 'openai';
          } else if (geminiModel) {
            const prompt = systemPrompt + "\n\n" + messageText;
            try {
              const result = await geminiModel.generateContent(prompt);
              const text = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                response = String(text).trim();
                responseSource = 'gemini';
              } else if (process.env.GOOGLE_API_KEY) {
                const httpModel = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
                const httpText = await callGeminiHTTP(httpModel, prompt);
                if (httpText) {
                  response = httpText;
                  responseSource = 'gemini';
                }
              }
            } catch (ge) {
              console.error('[Baileys] Gemini error:', ge);
              if (process.env.GOOGLE_API_KEY) {
                try {
                  const httpModel = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
                  const httpText = await callGeminiHTTP(httpModel, prompt);
                  if (httpText) {
                    response = httpText;
                    responseSource = 'gemini';
                  }
                } catch (he) {
                  console.error('[Baileys] Gemini HTTP error:', he);
                }
              }
            }
          }
        } catch (openaiError) {
          console.error('[Baileys] OpenAI error:', openaiError);
          response = "أعتذر، لم أعثر على معلومات كافية حاليًا.";
          responseSource = 'fallback';
        }
      }

      // Final fallback
      if (!response) {
        response = 'أعتذر، لم أستطع توليد إجابة الآن.';
        responseSource = 'fallback';
      }

      // Send response
      if (response) {
        const limitCheck = await limitService.canSendMessage(userId, 'whatsapp');
        if (!limitCheck.canSend) {
          console.log(`[Baileys] Bot response blocked due to limit: ${limitCheck.reason}`);
          this.conversationLocks.delete(conversationKey);
          return;
        }

        // ✅ Add variable delay (3-6 seconds) to make responses look more natural
        const baseDelay = 3000;
        const variation = 3000;
        const randomDelay = baseDelay + Math.random() * variation;
        await delay(Math.round(randomDelay));
        const sendResult = await this.sendMessage(userId, from, response);
        
        if (sendResult === true) {
          await limitService.recordMessageUsage(userId, 'whatsapp', 'bot_response', 1, {
            responseSource: responseSource,
            contactNumber: from
          });
          console.log(`[Baileys] Bot response recorded in usage stats for user ${userId}`);
        }
      }

    } catch (error) {
      console.error('[Baileys] Message handling error:', error);
    } finally {
      if (conversationKey) {
        this.conversationLocks.delete(conversationKey);
      }
      
      try {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const [key, time] of this.lastMessageTime.entries()) {
          if (time < oneHourAgo) {
            this.lastMessageTime.delete(key);
          }
        }
      } catch (cleanupError) {
        console.log('[Baileys] Cleanup error (ignored):', cleanupError.message);
      }
    }
  }

  async sendMessage(userId, to, message) {
    try {
      const limitCheck = await limitService.canSendMessage(userId, 'whatsapp');
      if (!limitCheck.canSend) {
        console.log(`[Baileys] Message limit reached for user ${userId}: ${limitCheck.reason}`);
        return { success: false, error: limitCheck.reason, limitReached: true };
      }

      const sock = this.userSockets.get(userId);
      if (!sock) {
        console.log(`[Baileys] No socket available for user ${userId}`);
        return false;
      }

      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

      try {
        await sock.sendMessage(jid, { text: message });
        console.log(`[Baileys] Message sent successfully to ${jid}`);
        
        await this.logChatMessage(userId, to, 'outgoing', message, 'manual', null);
        await limitService.recordMessageUsage(userId, 'whatsapp', 'outgoing', 1);
        return true;
      } catch (sendErr) {
        console.log(`[Baileys] Send failed to ${jid}:`, sendErr?.message || sendErr);
        return false;
      }
    } catch (error) {
      console.error(`[Baileys] Send message failed:`, error);
      return false;
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
      console.error('[Baileys] Error logging chat message:', error);
    }
  }

  // ==================== TEMPLATES ====================

  async checkTemplateTriggers(userId, message, contactNumber) {
    try {
      const templates = await WhatsappTemplate.findAll({
        where: { userId, isActive: true },
        include: [
          {
            model: WhatsappTemplateButton,
            as: 'buttons',
            where: { parentButtonId: null, isActive: true },
            required: false
          }
        ],
        order: [['displayOrder', 'ASC']]
      });

      for (const template of templates) {
        if (template.triggerKeywords && template.triggerKeywords.length > 0) {
          const messageLower = message.toLowerCase();
          const hasTrigger = template.triggerKeywords.some(keyword => 
            messageLower.includes(keyword.toLowerCase())
          );
          
          if (hasTrigger) {
            const sent = await this.sendTemplateWithButtons(userId, contactNumber, template);
            if (sent) {
              return 'TEMPLATE_SENT';
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('[Baileys] Template trigger check error:', error);
      return null;
    }
  }

  formatTemplateMessage(template) {
    let message = '';
    
    if (template.headerText) {
      message += template.headerText + '\n\n';
    }

    if (template.footerText) {
      message += template.footerText;
    }

    return message;
  }

  async sendTemplateWithButtons(userId, contactNumber, template) {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) {
        console.error(`[Baileys] No socket found for user ${userId}`);
        return false;
      }

      const jid = contactNumber.includes('@') ? contactNumber : `${contactNumber}@s.whatsapp.net`;
      
      let messageText = this.formatTemplateMessage(template);
      
      if (template.buttons && template.buttons.length > 0) {
        messageText += '\n\n📋 *اختر من القائمة التالية:*\n';
        
        template.buttons.forEach((button, index) => {
          messageText += `\n${index + 1}. ${button.buttonText}`;
        });
        
        messageText += '\n\n💡 *اضغط على رقم الخيار المطلوب*';
      }

      await sock.sendMessage(jid, { text: messageText });
      
      console.log(`[Baileys] Sent template with ${template.buttons?.length || 0} buttons to ${contactNumber}`);
      return true;
    } catch (error) {
      console.error('[Baileys] Error sending template with buttons:', error);
      return false;
    }
  }

  async handleTemplateButtonSelection(userId, contactNumber, buttonNumber) {
    try {
      const templates = await WhatsappTemplate.findAll({
        where: { userId, isActive: true },
        include: [
          {
            model: WhatsappTemplateButton,
            as: 'buttons',
            where: { parentButtonId: null, isActive: true },
            required: false
          }
        ],
        order: [['displayOrder', 'ASC']]
      });

      for (const template of templates) {
        if (template.buttons && template.buttons.length >= buttonNumber) {
          const selectedButton = template.buttons[buttonNumber - 1];
          return await this.processButtonAction(selectedButton, template);
        }
      }

      return null;
    } catch (error) {
      console.error('[Baileys] Template button selection error:', error);
      return null;
    }
  }

  async processButtonAction(button, template) {
    switch (button.buttonType) {
      case 'reply':
        return button.responseText || 'تم استلام طلبك، سنتواصل معك قريباً.';
      
      case 'url':
        return `🔗 ${button.buttonText}\n\n${button.url}`;
      
      case 'phone':
        return `📞 ${button.buttonText}\n\n${button.phoneNumber}`;
      
      case 'nested':
        return this.formatNestedButtons(button, template);
      
      default:
        return button.responseText || 'شكراً لك!';
    }
  }

  formatNestedButtons(button, template) {
    let message = button.buttonText + '\n\n';
    
    if (button.ChildButtons && button.ChildButtons.length > 0) {
      message += 'اختر من القائمة الفرعية:\n\n';
      
      button.ChildButtons.forEach((childButton, index) => {
        message += `${index + 1}. ${childButton.buttonText}\n`;
      });
      
      message += '\nأرسل رقم الخيار المطلوب.';
    }

    return message;
  }

  // ==================== GROUPS ====================

  async listGroups(userId) {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) return { success: false, message: 'Socket not connected' };
      
      const groups = await sock.groupFetchAllParticipating();
      const groupList = Object.values(groups).map(g => ({
        id: g.id,
        name: g.subject,
        participantsCount: g.participants?.length || 0
      }));
      
      return { success: true, groups: groupList };
    } catch (e) {
      return { success: false, message: 'Failed to list groups', error: e.message };
    }
  }

  async sendToGroupByName(userId, groupName, message) {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) return { success: false, message: 'Socket not connected' };
      
      const groups = await sock.groupFetchAllParticipating();
      const group = Object.values(groups).find(g => 
        g.subject?.trim().toLowerCase() === groupName.trim().toLowerCase()
      );
      
      if (!group) return { success: false, message: 'Group not found' };
      
      await sock.sendMessage(group.id, { text: message });
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Failed to send to group', error: e.message };
    }
  }

  async sendToMultipleGroups(userId, groupNames, message, media, scheduleAt) {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) return { success: false, message: 'Socket not connected' };

      const groups = await sock.groupFetchAllParticipating();
      const groupNamesList = groupNames.map(g => String(g).trim().toLowerCase());
      const selected = Object.values(groups).filter(g => 
        groupNamesList.includes(g.subject?.trim().toLowerCase())
      );
      
      if (selected.length === 0) return { success: false, message: 'No matching groups found' };

      const sendToGroup = async (group) => {
        if (media && media.buffer) {
          const mimetype = media.mimetype || 'image/jpeg';
          await sock.sendMessage(group.id, {
            image: media.buffer,
            caption: message || ''
          });
        } else {
          await sock.sendMessage(group.id, { text: message });
        }
      };

      const now = Date.now();
      let scheduledFor = null;
      if (scheduleAt) {
        const t = new Date(scheduleAt).getTime();
        if (!isNaN(t) && t > now) scheduledFor = t;
      }

      if (scheduledFor) {
        setTimeout(async () => {
          for (const group of selected) {
            try { await sendToGroup(group); } catch (e) { console.error('[Baileys] group send error:', e?.message); }
            await delay(1000);
          }
        }, scheduledFor - now);
        return { success: true, message: `Scheduled to ${selected.length} group(s)` };
      } else {
        for (const group of selected) {
          await sendToGroup(group);
          await delay(500);
        }
        return { success: true, message: `Sent to ${selected.length} group(s)` };
      }
    } catch (e) {
      return { success: false, message: 'Failed to send to groups', error: e.message };
    }
  }

  async exportGroupMembers(userId, groupName) {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) return { success: false, message: 'Socket not connected' };
      
      const groups = await sock.groupFetchAllParticipating();
      const group = Object.values(groups).find(g => 
        g.subject?.trim().toLowerCase() === groupName.trim().toLowerCase()
      );
      
      if (!group) return { success: false, message: 'Group not found' };
      
      const rows = group.participants.map(p => ({ 
        phone: p.id.split('@')[0],
        wid: p.id
      }));
      
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'members');
      
      const dir = 'uploads/exports';
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, `group_${Date.now()}.xlsx`);
      xlsx.writeFile(wb, filePath);
      
      return { success: true, file: `/${filePath.replace(/\\/g, '/')}` };
    } catch (e) {
      return { success: false, message: 'Failed to export group members', error: e.message };
    }
  }

  // ==================== STATUS/STORIES ====================

  async postStatus(userId, mediaBuffer, filename, caption) {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) return { success: false, message: 'Socket not connected' };
      
      await sock.sendMessage('status@broadcast', {
        image: mediaBuffer,
        caption: caption || ''
      });
      
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Failed to post status', error: e.message };
    }
  }

  async sendStatusUpdate(userId, buffer, filename, mimetype, caption = '') {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) {
        return { success: false, error: 'WhatsApp session not active' };
      }

      const messageContent = mimetype.startsWith('image/') 
        ? { image: buffer, caption: caption || undefined }
        : { video: buffer, caption: caption || undefined };

      const result = await sock.sendMessage('status@broadcast', messageContent);
      
      console.log(`[Baileys] Status update sent for user ${userId}`);
      
      return {
        success: true,
        id: result?.key?.id || `status_${Date.now()}`,
        message: 'WhatsApp status updated successfully'
      };
    } catch (error) {
      console.error(`[Baileys] Failed to send status update for user ${userId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to send status update'
      };
    }
  }

  // ==================== CAMPAIGN ====================

  async startCampaign(userId, rows, messageTemplate, throttleMs = 3000, media = null) {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) return { success: false, message: 'Socket not connected' };
      
      const limitCheck = await limitService.canSendMessage(userId, 'whatsapp');
      if (!limitCheck.canSend) {
        return { success: false, message: limitCheck.reason, limitReached: true };
      }
      
      // ✅ Ensure minimum throttle is 5 seconds for campaigns (safer for spam detection)
      const minThrottle = Math.max(throttleMs, 5000);
      
      let sent = 0, failed = 0;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const raw = String(row.phone || row.number || '').replace(/\D/g, '');
        if (!raw) { failed++; continue; }
        
        // ✅ Add random variation to throttle (base ± 30%) to make it look more natural
        const variation = minThrottle * 0.3; // 30% variation
        const randomThrottle = minThrottle + (Math.random() * 2 - 1) * variation; // ±30%
        const actualThrottle = Math.max(4000, randomThrottle); // Minimum 4 seconds
        
        const personalized = String(row.message || messageTemplate || '').replace(/\{\{name\}\}/gi, row.name || '');
        const jid = `${raw}@s.whatsapp.net`;
        
        let ok = false;
        try {
          if (media && media.buffer) {
            const mimetype = media.mimetype || 'image/jpeg';
            await sock.sendMessage(jid, {
              image: media.buffer,
              caption: personalized || ''
            });
            ok = true;
          } else {
            await sock.sendMessage(jid, { text: personalized || '' });
            ok = true;
          }
        } catch (e) {
          console.log(`[Baileys] Campaign send error for ${raw}:`, e?.message || e);
          ok = false;
        }
        
        if (ok) {
          sent++;
          await limitService.recordMessageUsage(userId, 'whatsapp', 'campaign', 1);
        } else {
          failed++;
        }
        
        // ✅ Wait with variation before next message (except for last message)
        if (i < rows.length - 1) {
          await delay(Math.round(actualThrottle));
          console.log(`[Baileys] Campaign throttle: ${Math.round(actualThrottle)}ms (${i + 1}/${rows.length})`);
        }
      }
      return { success: true, summary: { sent, failed, total: rows.length } };
    } catch (e) {
      return { success: false, message: 'Campaign failed', error: e.message };
    }
  }

  async sendMediaTo(userId, to, buffer, filename, mimetype, caption = '') {
    try {
      const sock = this.userSockets.get(userId);
      if (!sock) return false;
      
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
      
      const messageContent = mimetype.startsWith('image/')
        ? { image: buffer, caption: caption || undefined }
        : mimetype.startsWith('video/')
        ? { video: buffer, caption: caption || undefined }
        : { document: buffer, mimetype, fileName: filename, caption: caption || undefined };

      await sock.sendMessage(jid, messageContent);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ==================== BOT CONTROL ====================

  async pauseBotForUser(userId, minutes = 30) {
    try {
      const user = await User.findByPk(userId);
      if (user) {
        const pauseUntil = new Date();
        pauseUntil.setMinutes(pauseUntil.getMinutes() + minutes);
        
        await user.update({
          botPaused: true,
          botPausedUntil: pauseUntil
        });
        
        console.log(`[Baileys] Bot paused for user ${userId} until ${pauseUntil.toISOString()}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[Baileys] Failed to pause bot for user ${userId}:`, error);
      return false;
    }
  }

  async resumeBotForUser(userId) {
    try {
      const user = await User.findByPk(userId);
      if (user) {
        await user.update({
          botPaused: false,
          botPausedUntil: null
        });
        
        console.log(`[Baileys] Bot resumed for user ${userId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[Baileys] Failed to resume bot for user ${userId}:`, error);
      return false;
    }
  }

  // ==================== CHAT HISTORY & STATS ====================

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
          contentType: chat.contentType || 'text',
          mediaUrl: chat.mediaUrl,
          mediaFilename: chat.mediaFilename,
          mediaMimetype: chat.mediaMimetype,
          responseSource: chat.responseSource,
          knowledgeBaseMatch: chat.knowledgeBaseMatch,
          timestamp: chat.timestamp
        }))
      };
    } catch (error) {
      console.error('[Baileys] Get chat history error:', error);
      return { success: false, message: 'Failed to get chat history', error: error.message };
    }
  }

  async getChatContacts(userId) {
    try {
      const contacts = await WhatsappChat.findAll({
        where: { 
          userId,
          messageType: 'outgoing'
        },
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
      console.error('[Baileys] Get chat contacts error:', error);
      return { success: false, message: 'Failed to get chat contacts', error: error.message };
    }
  }

  async getBotStats(userId) {
    try {
      const allStats = await WhatsappChat.findAll({
        where: { userId },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalMessages'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN messageType = "incoming" THEN 1 END')), 'incomingMessages'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN messageType = "outgoing" THEN 1 END')), 'outgoingMessages']
        ],
        raw: true
      });

      const botStats = await WhatsappChat.findAll({
        where: { 
          userId,
          messageType: 'outgoing'
        },
        attributes: [
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
          totalMessages: parseInt(allStats[0].totalMessages) || 0,
          incomingMessages: parseInt(allStats[0].incomingMessages) || 0,
          outgoingMessages: parseInt(allStats[0].outgoingMessages) || 0,
          totalContacts: totalContacts,
          knowledgeBaseResponses: parseInt(botStats[0].knowledgeBaseResponses) || 0,
          openaiResponses: parseInt(botStats[0].openaiResponses) || 0,
          fallbackResponses: parseInt(botStats[0].fallbackResponses) || 0
        }
      };
    } catch (error) {
      console.error('[Baileys] Get bot stats error:', error);
      return { success: false, message: 'Failed to get bot stats', error: error.message };
    }
  }
}

module.exports = new BaileysService();

