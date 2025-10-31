const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const qrcode = require('qrcode-terminal');
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
      console.log('[WA] Using Gemini model:', sdkModelId);
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

class WhatsAppService {
  constructor() {
    this.userClients = new Map();
    this.userStates = new Map();
    this.messageCounters = new Map();
    this.qrCodes = new Map(); // Store QR codes for each user
    this.conversationLocks = new Map(); // Track active conversations to prevent multiple responses
    this.lastMessageTime = new Map(); // Track last message time per conversation
    this.initializationLocks = new Map(); // CRITICAL: Prevent multiple simultaneous initializations
    this.statusCache = new Map(); // ✅ Cache status to prevent repeated getState() calls
    this.userCache = new Map(); // ✅ Cache user data to prevent repeated DB queries
    this.settingsCache = new Map(); // ✅ Cache bot settings to prevent repeated DB queries
    this.knowledgeBaseCache = new Map(); // ✅ Cache knowledge base to prevent repeated DB queries
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

  // Check if current time is within working hours
  async isWithinWorkingHours(userId) {
    try {
      // ✅ Cache settings to prevent repeated DB queries
      const cacheKey = `settings_${userId}`;
      let settings = this.settingsCache.get(cacheKey);
      
      if (!settings || Date.now() - settings.timestamp > 60000) {
        // Cache for 1 minute
        settings = await BotSettings.findOne({ where: { userId } });
        this.settingsCache.set(cacheKey, { data: settings, timestamp: Date.now() });
      } else {
        settings = settings.data;
      }
      
      if (!settings || !settings.workingHoursEnabled) {
        return { isWorkingHours: true, message: null };
      }

      const now = new Date();
      const timezone = settings.timezone || 'Asia/Riyadh';
      
      // Convert to user's timezone
      const userTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
      const currentDay = userTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentTime = userTime.toTimeString().split(' ')[0]; // HH:MM:SS format
      
      // Check if today is a working day
      const workingDays = settings.workingDays || [1, 2, 3, 4, 5]; // Default: Monday to Friday
      if (!workingDays.includes(currentDay)) {
        return { 
          isWorkingHours: false, 
          message: settings.outsideWorkingHoursMessage || 'نعتذر، نحن خارج أوقات العمل. سنرد عليك في أقرب وقت ممكن.'
        };
      }

      // Check if current time is within working hours
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
      console.error('Error checking working hours:', error);
      return { isWorkingHours: true, message: null }; // Default to working hours if error
    }
  }

  async startSession(userId, options = {}) {
    try {
      // ✅ Removed excessive logging to prevent connection issues
      
      // CRITICAL: Check if initialization is already in progress
      if (this.initializationLocks.has(userId)) {
        return {
          success: true,
          message: 'WhatsApp session is already initializing',
          qrCode: this.qrCodes.get(userId) || null,
          status: this.qrCodes.get(userId) ? 'qr_generated' : 'initializing'
        };
      }
      
      // SET LOCK immediately to prevent concurrent calls
      this.initializationLocks.set(userId, true);
      
      // Explicitly clear stopped flag when starting
      const prev = this.userStates.get(userId) || {};
      prev.stopped = false;
      this.userStates.set(userId, prev);

      // Check if user already has an active session
      if (this.userClients.has(userId)) {
        // DISABLED state check - may cause LOGOUT
        // Just return that session exists
        this.initializationLocks.delete(userId);
        return {
          success: true,
          message: 'WhatsApp session already active',
          qrCode: null,
          status: 'connected'
        };
      }

      // Set initializing state and reset message counter
      this.userStates.set(userId, { initializing: true, reconnecting: false, stopped: false });
      this.messageCounters.set(userId, 0);

      // Create WhatsApp client with FIXED session ID (no timestamp!)
      // Using timestamp creates NEW device each time → WhatsApp logs out old sessions!
      const sessionId = `user_${userId}`;
      
      // 🔥 OPTIMIZED CLIENT - أفضل إعدادات للاستقرار
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: './data/wa-auth'
        }),
        puppeteer: {
          headless: true, // ✅ headless للاستقرار
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled'
          ],
          defaultViewport: null,
          ignoreHTTPSErrors: true
        },
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        },
        qrMaxRetries: 5,
        authTimeoutMs: 60000,
        restartOnAuthFail: false,
        takeoverOnConflict: false,
        takeoverTimeoutMs: 0
      });

      let qrCodeData = null;

      // Enhanced QR code handling
      client.on('qr', async (qr) => {
        try {
          qrCodeData = await QRCode.toDataURL(qr);
          this.qrCodes.set(userId, qrCodeData);
          
          // ✅ Only show QR in terminal (silent mode to reduce logs)
          qrcode.generate(qr, { small: true });
        } catch (err) {
          console.error('[WA] QR Code generation failed:', err);
        }
      });

      // Use 'once' to ensure these events fire only ONCE per client lifecycle
      client.once('ready', async () => {
        // ✅ Silent mode - removed logging to prevent connection issues
        this.userClients.set(userId, client);
        const s = this.userStates.get(userId) || {};
        s.initializing = false;
        s.ready = true;
        this.userStates.set(userId, s);
        
        // Clear QR code once connected
        this.qrCodes.delete(userId);
        
        // ✅ Clear all caches when ready to force fresh data
        this.statusCache.delete(`status_${userId}`);
        this.userCache.delete(`user_${userId}`);
        this.settingsCache.delete(`settings_${userId}`);
        this.knowledgeBaseCache.delete(`kb_${userId}`);
        
        // RELEASE LOCK when ready
        this.initializationLocks.delete(userId);
        
        // 🤖 INJECT ANTI-DETECTION SCRIPT (silent)
        try {
          const pages = await client.pupBrowser.pages();
          const page = pages[0];
          if (page) {
            await page.evaluateOnNewDocument(() => {
              // Remove webdriver property
              Object.defineProperty(navigator, 'webdriver', { get: () => false });
              
              // Remove automation flags
              Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
              Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
              
              // Override permissions
              const originalQuery = window.navigator.permissions.query;
              window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                  Promise.resolve({ state: Notification.permission }) :
                  originalQuery(parameters)
              );
            });
          }
        } catch (antiDetectErr) {
          // Silent - non-critical
        }
      });

      client.once('authenticated', () => {
        // ✅ Silent mode
      });

      client.once('auth_failure', (msg) => {
        console.error(`[WA] ❌ WhatsApp auth failure for user ${userId}:`, msg);
        this.userClients.delete(userId);
        this.qrCodes.delete(userId);
        const s = this.userStates.get(userId) || {};
        s.initializing = false;
        this.userStates.set(userId, s);
        
        // RELEASE LOCK on auth failure
        this.initializationLocks.delete(userId);
      });

      // Use 'once' to ensure disconnection handler fires only ONCE
      client.once('disconnected', (reason) => {
        // ⚠️ معالجة خاصة للـ LOGOUT - واتساب كشف الأتمتة
        if (reason === 'LOGOUT') {
          console.error(`[WA] CRITICAL: WhatsApp LOGOUT for user ${userId}`);
          // حذف session files تلقائياً عند LOGOUT
          this.cleanupSessionFilesOnLogout(userId);
        }
        
        this.handleDisconnection(userId, reason);
      });

      // ✅ Removed state change logging (too frequent)
      // client.on('change_state', (state) => {});

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

        // If message is in a group, only respond when the bot is mentioned
        try {
          if (String(message.from).endsWith('@g.us')) {
            const currentClient = this.userClients.get(userId);
            const selfId = currentClient?.info?.wid?._serialized;
            if (selfId) {
              const mentions = await message.getMentions().catch(() => []);
              const mentioned = Array.isArray(mentions) && mentions.some(m => m?.id?._serialized === selfId);
              if (!mentioned) {
                return; // skip non-mention group messages
              }
            }
          }
        } catch {}
        
        if (message.body === 'ping') {
          return; // ✅ Silent - ignore ping
        }
        
        // ✅ Removed message logging (too frequent)
        try {
          await this.handleIncomingMessage(message, userId);
        } catch (error) {
          console.error(`[WA] Error handling message for user ${userId}:`, error);
        }
      });

      // Initialize the client with error handling and timeout
      try {
        // ✅ Silent initialization
        
        // Add timeout to prevent hanging
        const initPromise = client.initialize();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Initialization timeout after 120 seconds')), 120000)
        );
        
        await Promise.race([initPromise, timeoutPromise]);
      } catch (initError) {
        console.error(`[WA] Client initialization failed for user ${userId}:`, initError.message);
        this.userStates.set(userId, { initializing: false, reconnecting: false });
        this.initializationLocks.delete(userId);
        
        // Clean up failed client
        try {
          client.removeAllListeners();
          await client.destroy().catch(() => {});
        } catch (e) {}
        
        throw new Error(`Failed to initialize WhatsApp client: ${initError.message}`);
      }

      // Wait for QR code generation
      await new Promise(resolve => setTimeout(resolve, 2000));

      return {
        success: true,
        message: 'WhatsApp session started',
        qrCode: qrCodeData,
        status: 'qr_generated'
      };

    } catch (error) {
      console.error('[WA] ❌ WhatsApp session start error:', error);
      const s = this.userStates.get(userId) || {};
      s.initializing = false;
      this.userStates.set(userId, s);
      
      // RELEASE LOCK on error
      this.initializationLocks.delete(userId);
      
      return {
        success: false,
        message: 'Failed to start WhatsApp session',
        error: error.message
      };
    }
  }

  setupKeepAlive(userId, client) {
    // ✅ SAFE Keep-alive using sendPresenceAvailable instead of getState
    // ✅ SILENT mode - no logging to prevent connection issues
    const keepAliveInterval = setInterval(async () => {
      try {
        if (!this.userClients.has(userId)) {
          clearInterval(keepAliveInterval);
          return;
        }
        
        if (client && client.info && client.info.wid) {
          try {
            // ✅ استخدام sendPresenceAvailable بدلاً من getState - أكثر أماناً!
            await client.sendPresenceAvailable();
          } catch (presenceError) {
            // إذا فشل presence، معناه الاتصال انقطع
            clearInterval(keepAliveInterval);
          }
        }
      } catch (error) {
        clearInterval(keepAliveInterval);
      }
    }, 50000); // ✅ كل 50 ثانية بدلاً من 10 - أقل تطفلاً

    // Store the interval ID for cleanup
    const s = this.userStates.get(userId) || {};
    s.keepAliveInterval = keepAliveInterval;
    this.userStates.set(userId, s);
  }

  handleDisconnection(userId, reason) {
    // ✅ Silent mode - only log critical errors
    this.userClients.delete(userId);
    this.qrCodes.delete(userId);
    
    // ✅ Clear all caches on disconnection
    this.statusCache.delete(`status_${userId}`);
    this.userCache.delete(`user_${userId}`);
    this.settingsCache.delete(`settings_${userId}`);
    this.knowledgeBaseCache.delete(`kb_${userId}`);
    
    // RELEASE LOCK on disconnection
    this.initializationLocks.delete(userId);
    
    // Clean up conversation locks and message times for this user
    this.cleanupUserConversations(userId);
    
    const s = this.userStates.get(userId) || {};
    s.initializing = false;
    s.ready = false;
    
    // Clear keep-alive interval
    if (s.keepAliveInterval) {
      clearInterval(s.keepAliveInterval);
      s.keepAliveInterval = null;
    }
    
    this.userStates.set(userId, s);
    
    // Clear reconnecting flag
    const state = this.userStates.get(userId) || {};
    state.reconnecting = false;
    state.stopped = false; // Reset stopped flag to allow manual reconnect
    this.userStates.set(userId, state);
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

  // ⚠️ تنظيف شامل عند LOGOUT - حذف كل session files للمستخدم
  cleanupSessionFilesOnLogout(userId) {
    try {
      const sessionId = `user_${userId}`;
      const authPaths = [
        './data/wa-auth',
        './.wwebjs_auth'
      ];
      
      authPaths.forEach(authDir => {
        if (fs.existsSync(authDir)) {
          const entries = fs.readdirSync(authDir);
          entries.forEach(entry => {
            // حذف أي session يخص هذا المستخدم
            if (entry.includes(sessionId) || entry.startsWith(`session-${sessionId}`)) {
              const sessionPath = path.join(authDir, entry);
              try {
                console.log(`[WA] 🗑️ Removing corrupted session: ${entry}`);
                fs.rmSync(sessionPath, { recursive: true, force: true, maxRetries: 3 });
                console.log(`[WA] ✅ Removed: ${entry}`);
              } catch (err) {
                if (err.code === 'EBUSY' || err.code === 'EPERM') {
                  console.log(`[WA] ⚠️ Could not remove ${entry} (file locked). Run cleanup-sessions.js manually.`);
                }
              }
            }
          });
        }
      });
    } catch (error) {
      console.error(`[WA] Error cleaning up session files for user ${userId}:`, error.message);
    }
  }

  async handleIncomingMessage(message, userId) {
    let conversationKey = null;
    
    try {
      // Validate input parameters
      if (!message || !userId || !message.from) {
        return; // ✅ Silent
      }
      
      // Create a unique conversation key
      conversationKey = `${userId}_${message.from}`;
      const now = Date.now();
      
      // Check if we're already processing a message for this conversation
      if (this.conversationLocks.has(conversationKey)) {
        return; // ✅ Silent
      }
      
      // Check for rapid successive messages (within 3 seconds)
      const lastTime = this.lastMessageTime.get(conversationKey) || 0;
      if (now - lastTime < 3000) {
        return; // ✅ Silent
      }
      
      // Update last message time
      this.lastMessageTime.set(conversationKey, now);
      
      // Set conversation lock
      this.conversationLocks.set(conversationKey, true);
      
      // Auto-release lock after 5 seconds to prevent permanent locks
      setTimeout(() => {
        this.conversationLocks.delete(conversationKey);
      }, 5000);
      
      // Always save incoming message first, regardless of bot status
      await conversationService.saveMessage(userId, message.from, 'incoming', message.body);
      
      // ✅ Cache user data to prevent repeated DB queries
      const userCacheKey = `user_${userId}`;
      let userData = this.userCache.get(userCacheKey);
      
      if (!userData || Date.now() - userData.timestamp > 30000) {
        // Cache for 30 seconds
        const user = await User.findByPk(userId);
        userData = { data: user, timestamp: Date.now() };
        this.userCache.set(userCacheKey, userData);
      }
      
      const user = userData.data;
      if (user && user.botPaused) {
        // Check if pause has expired
        if (user.botPausedUntil && new Date() > user.botPausedUntil) {
          // Resume bot
          await user.update({ botPaused: false, botPausedUntil: null });
        } else {
          // Bot is still paused, don't respond but message is already saved
          this.conversationLocks.delete(conversationKey);
          return; // ✅ Silent
        }
      }

      // Check working hours
      const workingHoursCheck = await this.isWithinWorkingHours(userId);
      if (!workingHoursCheck.isWorkingHours) {
        // ✅ Silent
        // Send outside working hours message
        const client = this.userClients.get(userId);
        if (client) {
          try {
            await client.sendMessage(message.from, workingHoursCheck.message);
            // Log the message
            await conversationService.saveMessage(userId, message.from, 'outgoing', workingHoursCheck.message, 'working_hours');
          } catch (error) {
            console.error(`[WA] Failed to send working hours message:`, error);
          }
        }
        this.conversationLocks.delete(conversationKey);
        return;
      }
      
      // Check for template triggers first
      const templateResponse = await this.checkTemplateTriggers(userId, message.body, message.from);
      if (templateResponse === 'TEMPLATE_SENT') {
        // Template with interactive buttons was sent, no need to send additional message
        // Log template message (not sent via sendMessage so we need to log it manually)
        await this.logChatMessage(userId, message.from, 'outgoing', 'Interactive template sent', 'template', null);
        return;
      } else if (templateResponse) {
        // Fallback to old method if interactive buttons failed
        // sendMessage will log the message, so no need to call saveMessage again
        await this.sendMessage(userId, message.from, templateResponse);
        return;
      }

      // Check if message is a button selection (number)
      const messageBody = message.body.trim();
      const buttonNumber = parseInt(messageBody);
      
      if (!isNaN(buttonNumber) && buttonNumber > 0 && buttonNumber <= 10) {
        const buttonResponse = await this.handleTemplateButtonSelection(userId, message.from, buttonNumber);
        if (buttonResponse) {
          // sendMessage will log the message, so no need to call saveMessage again
          await this.sendMessage(userId, message.from, buttonResponse);
          return;
        }
      }
      
      let response = '';
      let responseSource = 'fallback';
      let knowledgeBaseMatch = null;
      
      // First, try dynamic BotData search with Fuse.js, then OpenAI fallback inside the service
      try {
        // ✅ Silent mode - removed logging
        const result = await searchOrAnswer(userId, message.body, 0.5, 3, message.from, null);
        if (result?.source === 'fuse' && Array.isArray(result.matches) && result.matches.length) {
          // Format top match into a comprehensive, organized product details
          const top = result.matches[0];
          const data = top.data || {};
          
          // Try to find relevant fields with better field matching
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
          
          // Add other fields that might be relevant
          Object.entries(data).forEach(([key, value]) => {
            if (value && String(value).trim() !== '' && 
                !['اسم_المنتج', 'product_name', 'name', 'الاسم', 'اسم', 'السعر', 'price', 'سعر', 
                  'الفئة', 'category', 'فئة', 'الوصف', 'description', 'وصف', 'تفاصيل', 'details',
                  'الماركة', 'brand', 'ماركة', 'الضمان', 'warranty', 'ضمان', 'المخزون', 'stock', 'مخزون'].includes(key)) {
              productDetails += `${key}: ${value}\n`;
            }
          });
          
          // No hardcoded marketing messages - use user settings instead
          
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
        // ✅ Silent - continue with fallback
      }

      // If still no response, try legacy knowledge base
      if (!response) {
        // ✅ Cache knowledge base to prevent repeated DB queries
        const kbCacheKey = `kb_${userId}`;
        let kbData = this.knowledgeBaseCache.get(kbCacheKey);
        
        if (!kbData || Date.now() - kbData.timestamp > 120000) {
          // Cache for 2 minutes
          const knowledgeEntries = await KnowledgeBase.findAll({ where: { userId, isActive: true } });
          kbData = { data: knowledgeEntries, timestamp: Date.now() };
          this.knowledgeBaseCache.set(kbCacheKey, kbData);
        }
        
        const knowledgeEntries = kbData.data;
        if (knowledgeEntries.length > 0) {
          const fuse = new Fuse(knowledgeEntries, { keys: ['keyword'], threshold: 0.6, includeScore: true });
          const results = fuse.search(message.body);
          if (results.length > 0 && results[0].score < 0.6) {
          response = results[0].item.answer;
          responseSource = 'knowledge_base';
          knowledgeBaseMatch = results[0].item.keyword;
          }
        }
      }

      // If still nothing, final LLM fallback: OpenAI then Gemini
      if (!response) {
        try {
          // ✅ Use cached settings instead of querying again
          const cacheKey = `settings_${userId}`;
          let settingsData = this.settingsCache.get(cacheKey);
          
          if (!settingsData || Date.now() - settingsData.timestamp > 60000) {
            settingsData = { data: await BotSettings.findOne({ where: { userId } }), timestamp: Date.now() };
            this.settingsCache.set(cacheKey, settingsData);
          }
          
          const userSettings = settingsData.data;
          
          // Build system prompt based on user settings
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
          
          systemPrompt += " إذا لم تجد المنتج/الخدمة المطلوبة، اعتذر وأخبره أن الخدمة ستتوفر قريباً. إذا قال 'مستعد' أو 'بدي اشتريها'، قدم رابط الشراء مباشرة. كن مختصراً واحترافياً، لا تكرر الترحيب.";
          
          if (openai) {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message.body }
            ],
            max_tokens: 150
          });
          response = completion.choices[0].message.content;
          responseSource = 'openai';
          } else if (geminiModel) {
            const prompt = systemPrompt + "\n\n" + message.body;
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
              console.error('[WA] Gemini error:', ge);
              if (process.env.GOOGLE_API_KEY) {
                try {
                  const httpModel = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
                  const httpText = await callGeminiHTTP(httpModel, prompt);
                  if (httpText) {
                    response = httpText;
                    responseSource = 'gemini';
                  }
                } catch (he) {
                  console.error('[WA] Gemini HTTP error:', he);
                }
              }
            }
          }
        } catch (openaiError) {
          console.error('OpenAI error:', openaiError);
          // Keep a deterministic Arabic fallback but do not block the pipeline
          response = "أعتذر، لم أعثر على معلومات كافية حاليًا.";
          responseSource = 'fallback';
        }
      }

      // Final fallback response (no echo)
      if (!response) {
        // ✅ Silent fallback
        response = 'أعتذر، لم أستطع توليد إجابة الآن.';
        responseSource = 'fallback';
      }

      // Send response (with variable delay) and log it
      if (response) {
        // Check limits before sending bot response
        const limitCheck = await limitService.canSendMessage(userId, 'whatsapp');
        if (!limitCheck.canSend) {
          // ✅ Silent - limit reached
          return;
        }

        // ✅ Add variable delay (3-6 seconds) to make responses look more natural and human-like
        const baseDelay = 3000; // 3 seconds base
        const variation = 3000; // ±3 seconds variation
        const randomDelay = baseDelay + Math.random() * variation; // 3-6 seconds
        await new Promise(r => setTimeout(r, Math.round(randomDelay)));
        const sendResult = await this.sendMessage(userId, message.from, response);
        
        // Only record usage if message was sent successfully
        // Note: sendMessage already logs the message to database via logChatMessage
        // So we don't call conversationService.saveMessage here to prevent duplicates
        if (sendResult === true) {
          // Record message usage for bot AI response
          await limitService.recordMessageUsage(userId, 'whatsapp', 'bot_response', 1, {
            responseSource: responseSource,
            contactNumber: message.from
          });
          // ✅ Silent
        }
      }

    } catch (error) {
      console.error('Message handling error:', error);
    } finally {
      // Always release the conversation lock if it exists
      if (conversationKey) {
        this.conversationLocks.delete(conversationKey);
      }
      
      // Clean up old message times (older than 1 hour)
      try {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const [key, time] of this.lastMessageTime.entries()) {
          if (time < oneHourAgo) {
            this.lastMessageTime.delete(key);
          }
        }
      } catch (cleanupError) {
        // Silently ignore cleanup errors
        console.log('[WA] Cleanup error (ignored):', cleanupError.message);
      }
    }
  }

  // Check for template triggers
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
        // Check trigger keywords
        if (template.triggerKeywords && template.triggerKeywords.length > 0) {
          const messageLower = message.toLowerCase();
          const hasTrigger = template.triggerKeywords.some(keyword => 
            messageLower.includes(keyword.toLowerCase())
          );
          
          if (hasTrigger) {
            // Send template with buttons
            const sent = await this.sendTemplateWithButtons(userId, contactNumber, template);
            if (sent) {
              return 'TEMPLATE_SENT'; // Special flag to indicate template was sent
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Template trigger check error:', error);
      return null;
    }
  }

  // Format template message with interactive buttons
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

  // Send template with interactive buttons
  async sendTemplateWithButtons(userId, contactNumber, template) {
    try {
      const client = this.userClients.get(userId);
      if (!client) {
        console.error(`[WA] No client found for user ${userId}`);
        return false;
      }

      const chatId = contactNumber.endsWith('@c.us') ? contactNumber : `${contactNumber}@c.us`;
      
      // Format the message text with buttons
      let messageText = this.formatTemplateMessage(template);
      
      // Add buttons as clickable text
      if (template.buttons && template.buttons.length > 0) {
        messageText += '\n\n📋 *اختر من القائمة التالية:*\n';
        
        template.buttons.forEach((button, index) => {
          messageText += `\n${index + 1}. ${button.buttonText}`;
        });
        
        messageText += '\n\n💡 *اضغط على رقم الخيار المطلوب*';
      }

      // Send the message
      await client.sendMessage(chatId, messageText);
      
      // ✅ Silent
      return true;
    } catch (error) {
      console.error('[WA] Error sending template with buttons:', error);
      return false;
    }
  }

  // Handle template button selection
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
      console.error('Template button selection error:', error);
      return null;
    }
  }

  // Process button action
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

  // Format nested buttons
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
      // Check message limits first
      const limitCheck = await limitService.canSendMessage(userId, 'whatsapp');
      if (!limitCheck.canSend) {
        return { success: false, error: limitCheck.reason, limitReached: true };
      }

      const client = this.userClients.get(userId);
      if (!client) {
        return false; // ✅ Silent
      }

      // DISABLED state check - may cause LOGOUT issues
      // Just attempt to send directly

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
        // Log the sent message to database
        await this.logChatMessage(userId, to, 'outgoing', message, 'manual', null);
        // Record message usage
        await limitService.recordMessageUsage(userId, 'whatsapp', 'outgoing', 1);
        return true;
      } catch (sendErr) {
        console.log(`[WA] First send attempt failed to ${chatId}:`, sendErr?.message || sendErr);
        // Retry once after short delay
        await new Promise(r => setTimeout(r, 500));
        try {
          await attemptSend();
          // Log the sent message to database
          await this.logChatMessage(userId, to, 'outgoing', message, 'manual', null);
          // Record message usage
          await limitService.recordMessageUsage(userId, 'whatsapp', 'outgoing', 1);
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
    // ✅ CRITICAL: Cache status to prevent repeated getState() calls that cause disconnections
    const cacheKey = `status_${userId}`;
    const cached = this.statusCache.get(cacheKey);
    
    // Cache for 10 seconds - prevents excessive getState() calls
    if (cached && Date.now() - cached.timestamp < 10000) {
      return cached.data;
    }

    const client = this.userClients.get(userId);
    const state = this.userStates.get(userId);

    if (!client) {
      const result = {
        success: true,
        status: 'disconnected',
        message: 'No active WhatsApp session'
      };
      // Cache disconnected status for 5 seconds
      this.statusCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }

    try {
      // ✅ ONLY call getState() if state is not already known as ready
      // This prevents repeated expensive calls that can cause disconnection
      let clientState;
      if (state?.ready) {
        // If we know it's ready, don't call getState() - just use cached state
        clientState = 'CONNECTED';
      } else {
        // Only call getState() if not ready (less frequent)
        clientState = await client.getState();
      }
      
      const result = {
        success: true,
        status: clientState,
        message: clientState === 'CONNECTED' ? 'WhatsApp session is active' : 'WhatsApp session is not ready',
        initializing: state?.initializing || false
      };
      
      // Cache the result for 10 seconds
      this.statusCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      const result = {
        success: true,
        status: 'error',
        message: 'Could not determine WhatsApp session status',
        error: error.message
      };
      // Cache error for 5 seconds
      this.statusCache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    }
  }

  async getQRCode(userId) {
    // ✅ No logging - silent mode
    const qrCode = this.qrCodes.get(userId);
    
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

  // Clean up conversation locks and message times for a specific user
  cleanupUserConversations(userId) {
    try {
      // Clean up conversation locks for this user
      const locksToDelete = [];
      for (const [key, value] of this.conversationLocks.entries()) {
        if (key.startsWith(`${userId}_`)) {
          locksToDelete.push(key);
        }
      }
      locksToDelete.forEach(key => this.conversationLocks.delete(key));
      
      // Clean up message times for this user
      const timesToDelete = [];
      for (const [key, value] of this.lastMessageTime.entries()) {
        if (key.startsWith(`${userId}_`)) {
          timesToDelete.push(key);
        }
      }
      timesToDelete.forEach(key => this.lastMessageTime.delete(key));
      
      console.log(`[WA] Cleaned up ${locksToDelete.length} conversation locks and ${timesToDelete.length} message times for user ${userId}`);
    } catch (error) {
      console.error('Error cleaning up user conversations:', error);
    }
  }

  async stopSession(userId) {
    try {
      // Mark as explicitly stopped to prevent auto-reconnect
      const state = this.userStates.get(userId) || {};
      state.stopped = true;
      state.initializing = false;
      state.reconnecting = false;
      this.userStates.set(userId, state);

      const client = this.userClients.get(userId);
      if (client) {
        await client.destroy();
      }
      
      this.userClients.delete(userId);
      this.qrCodes.delete(userId);
      
      // Clean up conversation locks and message times for this user
      this.cleanupUserConversations(userId);
      
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
      console.error('Get chat history error:', error);
      return { success: false, message: 'Failed to get chat history', error: error.message };
    }
  }

  async getChatContacts(userId) {
    try {
      const contacts = await WhatsappChat.findAll({
        where: { 
          userId,
          messageType: 'outgoing' // Only count bot responses (outgoing messages)
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
      console.error('Get chat contacts error:', error);
      return { success: false, message: 'Failed to get chat contacts', error: error.message };
    }
  }

  async getBotStats(userId) {
    try {
      // Get all messages for total count
      const allStats = await WhatsappChat.findAll({
        where: { userId },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalMessages'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN messageType = "incoming" THEN 1 END')), 'incomingMessages'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN messageType = "outgoing" THEN 1 END')), 'outgoingMessages']
        ],
        raw: true
      });

      // Get bot responses only (outgoing messages with response source)
      const botStats = await WhatsappChat.findAll({
        where: { 
          userId,
          messageType: 'outgoing' // Only bot responses
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
      console.error('Get bot stats error:', error);
      return { success: false, message: 'Failed to get bot stats', error: error.message };
    }
  }

  // ===== Groups and Status Utilities =====
  async listGroups(userId) {
    try {
      const client = this.userClients.get(userId);
      if (!client) return { success: false, message: 'Client not connected' };
      const chats = await client.getChats();
      const groups = chats.filter(c => c.isGroup);
      return {
        success: true,
        groups: groups.map(g => ({ id: g.id?._serialized, name: g.name, participantsCount: g.participants?.length || 0 }))
      };
    } catch (e) {
      return { success: false, message: 'Failed to list groups', error: e.message };
    }
  }

  async sendToGroupByName(userId, groupName, message) {
    try {
      const client = this.userClients.get(userId);
      if (!client) return { success: false, message: 'Client not connected' };
      const chats = await client.getChats();
      const group = chats.find(c => c.isGroup && String(c.name).trim().toLowerCase() === String(groupName).trim().toLowerCase());
      if (!group) return { success: false, message: 'Group not found' };
      await client.sendMessage(group.id._serialized, message);
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Failed to send to group', error: e.message };
    }
  }

  async sendToMultipleGroups(userId, groupNames, message, media, scheduleAt) {
    try {
      const client = this.userClients.get(userId);
      if (!client) return { success: false, message: 'Client not connected' };

      const chats = await client.getChats();
      const selected = chats.filter(c => c.isGroup && groupNames.map(g => String(g).trim().toLowerCase()).includes(String(c.name).trim().toLowerCase()));
      if (selected.length === 0) return { success: false, message: 'No matching groups found' };

      const sendToChat = async (chat) => {
        if (media && media.buffer) {
          const base64 = media.buffer.toString('base64');
          // Properly detect MIME type for images
          let mimeType = media.mimetype || 'application/octet-stream';
          if (media.filename) {
            const ext = media.filename.toLowerCase().split('.').pop();
            if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
            else if (ext === 'png') mimeType = 'image/png';
            else if (ext === 'gif') mimeType = 'image/gif';
            else if (ext === 'webp') mimeType = 'image/webp';
            else if (['mp4', 'mov'].includes(ext)) mimeType = 'video/mp4';
            else if (ext === 'avi') mimeType = 'video/avi';
            else if (ext === 'mkv') mimeType = 'video/mkv';
          }
          const msgMedia = new MessageMedia(mimeType, base64, media.filename || 'file');
          await client.sendMessage(chat.id._serialized, msgMedia, { caption: message || '' });
        } else {
          await client.sendMessage(chat.id._serialized, message);
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
          for (const chat of selected) {
            try { await sendToChat(chat); } catch (e) { console.error('[WA] group send error:', e?.message || e); }
            await new Promise(r => setTimeout(r, 1000));
          }
        }, scheduledFor - now);
        return { success: true, message: `Scheduled to ${selected.length} group(s) at ${new Date(scheduledFor).toISOString()}` };
      } else {
        for (const chat of selected) {
          await sendToChat(chat);
          await new Promise(r => setTimeout(r, 500));
        }
        return { success: true, message: `Sent to ${selected.length} group(s)` };
      }
    } catch (e) {
      return { success: false, message: 'Failed to send to groups', error: e.message };
    }
  }

  async exportGroupMembers(userId, groupName) {
    try {
      const client = this.userClients.get(userId);
      if (!client) return { success: false, message: 'Client not connected' };
      const chats = await client.getChats();
      const group = chats.find(c => c.isGroup && String(c.name).trim().toLowerCase() === String(groupName).trim().toLowerCase());
      if (!group) return { success: false, message: 'Group not found' };
      await group.fetchParticipants?.();
      const rows = (group.participants || []).map(p => ({ phone: p.id?.user || '', wid: p.id?._serialized || '' }));
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

  async postStatus(userId, mediaBuffer, filename, caption) {
    try {
      const client = this.userClients.get(userId);
      if (!client) return { success: false, message: 'Client not connected' };
      const media = new MessageMedia('image/png', mediaBuffer.toString('base64'), filename || 'status.png');
      await client.sendMessage('status@broadcast', media, { caption: caption || '' });
      return { success: true };
    } catch (e) {
      return { success: false, message: 'Failed to post status', error: e.message };
    }
  }

  // ===== Campaign (bulk sending) =====
  async startCampaign(userId, rows, messageTemplate, throttleMs = 3000, media = null) {
    try {
      const client = this.userClients.get(userId);
      if (!client) return { success: false, message: 'Client not connected' };
      
      // Check if user can send campaign messages
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
        let ok = false;
        
        try {
          if (media && media.buffer) {
            const chatId = raw.endsWith('@c.us') ? raw : `${raw}@c.us`;
            const base64 = media.buffer.toString('base64');
            // Properly detect MIME type for images
            let mimeType = media.mimetype || 'application/octet-stream';
            if (media.filename) {
              const ext = media.filename.toLowerCase().split('.').pop();
              if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
              else if (ext === 'png') mimeType = 'image/png';
              else if (ext === 'gif') mimeType = 'image/gif';
              else if (ext === 'webp') mimeType = 'image/webp';
              else if (['mp4', 'mov'].includes(ext)) mimeType = 'video/mp4';
              else if (ext === 'avi') mimeType = 'video/avi';
              else if (ext === 'mkv') mimeType = 'video/mkv';
            }
            const msgMedia = new MessageMedia(mimeType, base64, media.filename || 'file');
            await client.sendMessage(chatId, msgMedia, { caption: personalized || '' });
            ok = true;
          } else {
            ok = await this.sendMessage(userId, raw, personalized || '');
          }
          
          if (ok) {
            sent++;
            // Record message usage for campaign
            await limitService.recordMessageUsage(userId, 'whatsapp', 'campaign', 1);
          } else {
            failed++;
          }
        } catch (e) {
          console.log(`[WA] Campaign send error for ${raw}:`, e?.message || e);
          failed++;
        }
        
        // ✅ Wait with variation before next message (except for last message)
        if (i < rows.length - 1) {
          await new Promise(r => setTimeout(r, Math.round(actualThrottle)));
          console.log(`[WA] Campaign throttle: ${Math.round(actualThrottle)}ms (${i + 1}/${rows.length})`);
        }
      }
      return { success: true, summary: { sent, failed, total: rows.length } };
    } catch (e) {
      return { success: false, message: 'Campaign failed', error: e.message };
    }
  }

  // Send media message to a specific contact
  async sendMediaTo(userId, to, buffer, filename, mimetype, caption = '') {
    try {
      const client = this.userClients.get(userId);
      if (!client) return false;
      const raw = String(to || '').replace(/\D/g, '');
      if (!raw) return false;
      const chatId = raw.endsWith('@c.us') ? raw : `${raw}@c.us`;

      const base64 = buffer.toString('base64');
      let mimeType = mimetype || 'application/octet-stream';
      if (filename) {
        const ext = String(filename).toLowerCase().split('.').pop();
        if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
        else if (ext === 'png') mimeType = 'image/png';
        else if (ext === 'gif') mimeType = 'image/gif';
        else if (ext === 'webp') mimeType = 'image/webp';
        else if (['mp4', 'mov', 'm4v'].includes(ext)) mimeType = 'video/mp4';
      }
      const media = new MessageMedia(mimeType, base64, filename || 'file');
      await client.sendMessage(chatId, media, { caption: caption || '' });
      return true;
    } catch (_) {
      return false;
    }
  }

  // Pause bot for a specific user
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
        
        console.log(`[WA] Bot paused for user ${userId} until ${pauseUntil.toISOString()}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[WA] Failed to pause bot for user ${userId}:`, error);
      return false;
    }
  }

  // Resume bot for a specific user
  async resumeBotForUser(userId) {
    try {
      const user = await User.findByPk(userId);
      if (user) {
        await user.update({
          botPaused: false,
          botPausedUntil: null
        });
        
        console.log(`[WA] Bot resumed for user ${userId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`[WA] Failed to resume bot for user ${userId}:`, error);
      return false;
    }
  }

  // Send WhatsApp Status Update (Story)
  async sendStatusUpdate(userId, buffer, filename, mimetype, caption = '') {
    try {
      const client = this.userClients.get(userId);
      if (!client) {
        console.log(`[WA] No client available for user ${userId}`);
        return { success: false, error: 'WhatsApp session not active' };
      }

      // Check client state
      try {
        const state = await client.getState();
        if (state !== 'CONNECTED') {
          console.log(`[WA] Client state is ${state} for user ${userId}`);
          return { success: false, error: `WhatsApp not connected (state: ${state})` };
        }
      } catch (e) {
        console.log(`[WA] Could not verify client state for user ${userId}:`, e?.message);
        return { success: false, error: 'Could not verify WhatsApp connection' };
      }

      // Create MessageMedia from buffer
      const { MessageMedia } = require('whatsapp-web.js');
      const media = new MessageMedia(mimetype, buffer.toString('base64'), filename);
      
      console.log(`[WA] Sending status update for user ${userId}:`, {
        filename,
        mimetype,
        size: buffer.length,
        base64Length: buffer.toString('base64').length,
        hasCaption: !!caption
      });

      // Try to send status update using different methods
      let result;
      let method = 'unknown';
      
      try {
        // Method 1: Try using sendMessage to status@broadcast (most common)
        console.log(`[WA] Attempting Method 1: status@broadcast`);
        result = await client.sendMessage('status@broadcast', media, { 
          caption: caption || undefined,
          sendMediaAsSticker: false,
          sendMediaAsDocument: false
        });
        method = 'status@broadcast';
        console.log(`[WA] ✅ Method 1 succeeded - Status sent via status@broadcast`);
      } catch (error1) {
        console.error(`[WA] ❌ Method 1 failed:`, error1.message);
        
        // Method 2: Try getting my status and sending
        try {
          console.log(`[WA] Attempting Method 2: Direct status API`);
          const myNumber = await client.info.wid._serialized;
          console.log(`[WA] My number:`, myNumber);
          
          // Some versions support direct status API
          if (typeof client.sendStatusUpdate === 'function') {
            result = await client.sendStatusUpdate(media, { caption });
            method = 'direct-api';
            console.log(`[WA] ✅ Method 2 succeeded - Status sent via direct API`);
          } else {
            throw new Error('Direct status API not available');
          }
        } catch (error2) {
          console.error(`[WA] ❌ Method 2 failed:`, error2.message);
          
          // Method 3: Last resort - send to yourself as a workaround indicator
          console.warn(`[WA] ⚠️ Status posting may not be supported in this WhatsApp Web version`);
          console.warn(`[WA] ⚠️ Please note: WhatsApp Web.js may have limited status/story support`);
          throw new Error('Status posting is not supported in the current WhatsApp Web session. This is a limitation of WhatsApp Web.js library.');
        }
      }
      
      console.log(`[WA] Status update sent successfully for user ${userId} using method: ${method}`);
      console.log(`[WA] Result ID:`, result?.id?._serialized || 'N/A');
      
      return {
        success: true,
        id: result?.id?._serialized || `status_${Date.now()}`,
        message: `WhatsApp status updated successfully (method: ${method})`,
        method
      };
    } catch (error) {
      console.error(`[WA] Failed to send status update for user ${userId}:`, error);
      return {
        success: false,
        error: error.message || 'Failed to send status update'
      };
    }
  }
}

// Export singleton instance
module.exports = new WhatsAppService();
