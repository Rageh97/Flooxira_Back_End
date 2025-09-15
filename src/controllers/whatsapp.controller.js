const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { KnowledgeBase } = require('../models/knowledgeBase');
const { User } = require('../models/user');
const Fuse = require('fuse.js');
const OpenAI = require('openai');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// WhatsApp client instances per user
const userClients = new Map();
const userStates = new Map();
const messageCounters = new Map(); // Track message counts per user

// Global error handler for unhandled rejections (file locking issues)
// Remove all existing handlers first to prevent duplicates
process.removeAllListeners('unhandledRejection');
process.removeAllListeners('uncaughtException');

process.on('unhandledRejection', (reason, promise) => {
  // Suppress all file locking and LocalAuth errors
  if (reason && reason.message && (
    reason.message.includes('EBUSY') ||
    reason.message.includes('resource busy or locked') ||
    reason.message.includes('LocalAuth') ||
    reason.message.includes('chrome_debug.log') ||
    reason.message.includes('Cookies') ||
    reason.message.includes('unlink')
  )) {
    // Completely suppress these errors - don't log anything
    return;
  }
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  // Suppress all file locking and LocalAuth errors
  if (error && error.message && (
    error.message.includes('EBUSY') ||
    error.message.includes('resource busy or locked') ||
    error.message.includes('LocalAuth') ||
    error.message.includes('chrome_debug.log') ||
    error.message.includes('Cookies') ||
    error.message.includes('unlink')
  )) {
    // Completely suppress these errors - don't log anything
    return;
  }
  console.error('Uncaught Exception:', error);
});

// Multer configuration for Excel uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/knowledge';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `knowledge_${req.userId}_${Date.now()}.xlsx`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx) are allowed'), false);
    }
  }
});

async function startWhatsAppSession(req, res) {
  try {
    const userId = req.userId;
    
    // Check if already initializing
    const state = userStates.get(userId);
    if (state?.initializing) {
      return res.json({ 
        success: false, 
        message: 'WhatsApp session is already initializing',
        qrCode: null,
        status: 'initializing'
      });
    }

    // Check if user already has an active session
    if (userClients.has(userId)) {
      const existingClient = userClients.get(userId);
      try {
        const clientState = await existingClient.getState();
        if (clientState === 'CONNECTED') {
          return res.json({ 
            success: true, 
            message: 'WhatsApp session already active',
            qrCode: null,
            status: 'connected'
          });
        }
      } catch (error) {
        // If we can't get state, assume disconnected and continue
        console.log(`[WA] Could not get state for existing client, recreating: ${error.message}`);
        userClients.delete(userId);
      }
    }

    // Set initializing state and reset message counter
    userStates.set(userId, { initializing: true, reconnecting: false });
    messageCounters.set(userId, 0); // Reset message counter for new session

    // Create WhatsApp client with persistent session and anti-disconnect measures
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
          '--disable-javascript',
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
        // Keep the browser alive longer
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
      },
      // Add session persistence options to prevent disconnections
      restartOnAuthFail: false,
      takeoverOnConflict: false,
      takeoverTimeoutMs: 0,
      // Disable automatic logout
      authTimeoutMs: 0
    });

    let qrCodeData = null;

    client.on('qr', async (qr) => {
      try {
        qrCodeData = await QRCode.toDataURL(qr);
        console.log(`QR Code generated for user ${userId}`);
      } catch (err) {
        console.error('QR Code generation failed:', err);
      }
    });

    client.on('ready', () => {
      console.log(`WhatsApp client ready for user ${userId}`);
      userClients.set(userId, client);
      const s = userStates.get(userId) || {};
      s.initializing = false;
      s.ready = true;
      userStates.set(userId, s);
      
      // Set up continuous activity to prevent session timeout
      const keepAliveInterval = setInterval(async () => {
        try {
          // Check if client is still in the map (not disconnected)
          if (!userClients.has(userId)) {
            console.log(`[WA] Client no longer exists for user ${userId}, stopping keep-alive`);
            clearInterval(keepAliveInterval);
            return;
          }
          
          if (client && client.info && client.info.wid) {
            const messageCount = messageCounters.get(userId) || 0;
            console.log(`[WA] Keep-alive check for user ${userId} - still connected (${messageCount} messages processed)`);
            
            // Just check state, don't send ping messages
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
      }, 10000); // Check every 10 seconds
      
      // Store the interval ID for cleanup
      s.keepAliveInterval = keepAliveInterval;
      userStates.set(userId, s);
      
      // Add additional activity to prevent session timeout
      const activityInterval = setInterval(async () => {
        try {
          // Check if client is still in the map (not disconnected)
          if (!userClients.has(userId)) {
            console.log(`[WA] Client no longer exists for user ${userId}, stopping activity check`);
            clearInterval(activityInterval);
            return;
          }
          
          if (client && client.info && client.info.wid) {
            // Simulate user activity by checking connection status
            const isConnected = await client.getState();
            if (isConnected === 'CONNECTED') {
              console.log(`[WA] Activity check for user ${userId} - session active`);
            } else {
              console.log(`[WA] Activity check failed for user ${userId} - state: ${isConnected}`);
              clearInterval(activityInterval);
            }
          }
        } catch (error) {
          console.log(`[WA] Activity check failed for user ${userId}:`, error.message);
          clearInterval(activityInterval);
        }
      }, 5000); // Check every 5 seconds
      
      // Store activity interval for cleanup
      s.activityInterval = activityInterval;
      userStates.set(userId, s);
    });

    client.on('authenticated', () => {
      console.log(`WhatsApp client authenticated for user ${userId}`);
    });

    client.on('auth_failure', (msg) => {
      console.error(`WhatsApp auth failure for user ${userId}:`, msg);
      userClients.delete(userId);
      const s = userStates.get(userId) || {};
      s.initializing = false;
      userStates.set(userId, s);
    });

    client.on('disconnected', (reason) => {
      console.log(`WhatsApp client disconnected for user ${userId}:`, reason);
      
      // Always try to reconnect for any disconnect reason to keep bot responding
      userClients.delete(userId);
      const s = userStates.get(userId) || {};
      s.initializing = false;
      s.ready = false;
      
      // Clear keep-alive interval
      if (s.keepAliveInterval) {
        clearInterval(s.keepAliveInterval);
        s.keepAliveInterval = null;
      }
      
      // Clear activity interval
      if (s.activityInterval) {
        clearInterval(s.activityInterval);
        s.activityInterval = null;
      }
      
      userStates.set(userId, s);
      
      // Auto-reconnect after 5 seconds to keep bot responding (only once)
      if (!userStates.get(userId)?.reconnecting) {
        const s = userStates.get(userId) || {};
        s.reconnecting = true;
        userStates.set(userId, s);
        
        setTimeout(() => {
          if (!userClients.has(userId)) {
            console.log(`[WA] Auto-reconnecting user ${userId} after disconnect...`);
            try {
              startWhatsAppSession({ user: { id: userId } }, { json: () => {} });
            } catch (reconnectError) {
              console.log(`[WA] Reconnection failed for user ${userId}:`, reconnectError.message);
              // Reset reconnecting flag
              const s = userStates.get(userId) || {};
              s.reconnecting = false;
              userStates.set(userId, s);
            }
          }
        }, 5000);
      }
      
      // Clean up session files to prevent locking issues
      setTimeout(() => {
        try {
          // Clean up wa-auth directory
          const waAuthDir = './data/wa-auth';
          if (fs.existsSync(waAuthDir)) {
            const entries = fs.readdirSync(waAuthDir);
            entries.forEach(entry => {
              if (entry.startsWith(`user_${userId}_`)) {
                const sessionPath = path.join(waAuthDir, entry);
                try {
                  // Force remove the entire directory
                  fs.rmSync(sessionPath, { recursive: true, force: true });
                  console.log(`[WA] Cleaned up session files: ${entry}`);
                } catch (cleanupError) {
                  // Silently ignore cleanup errors to prevent console spam
                }
              }
            });
          }
        } catch (cleanupError) {
          // Silently ignore cleanup errors to prevent console spam
        }
      }, 10000); // Wait longer before cleanup
    });

    client.on('change_state', (state) => {
      console.log(`[WA] state changed for user ${userId}:`, state);
    });

    // Set up message handling
    client.on('message', async (message) => {
      if (message.fromMe) return;
      
      // Skip ping messages to prevent processing them
      if (message.body === 'ping') {
        console.log(`[WA] Ping message received from ${message.from}, ignoring`);
        return;
      }
      
      console.log(`[WA] message from ${message.from}:`, message.body?.slice(0, 80));
      
      try {
        await handleIncomingMessage(message, userId);
      } catch (error) {
        console.error(`[WA] Error handling message for user ${userId}:`, error);
      }
    });
    
    // Add a simple message handler to keep session alive
    client.on('message_create', (message) => {
      if (message.fromMe) {
        console.log(`[WA] Message sent by bot to ${message.to}`);
      }
    });

    // Initialize the client
    try {
      await client.initialize();
    } catch (initError) {
      console.error(`[WA] Client initialization failed for user ${userId}:`, initError);
      const s = userStates.get(userId) || {};
      s.initializing = false;
      userStates.set(userId, s);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to initialize WhatsApp client',
        error: initError.message 
      });
    }

    // Wait a moment for QR code generation
    await new Promise(resolve => setTimeout(resolve, 2000));

    res.json({
      success: true,
      message: 'WhatsApp session started',
      qrCode: qrCodeData,
      status: 'qr_generated'
    });

  } catch (error) {
    console.error('WhatsApp session start error:', error);
    const s = userStates.get(userId) || {};
    s.initializing = false;
    userStates.set(userId, s);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start WhatsApp session',
      error: error.message 
    });
  }
}

async function handleIncomingMessage(message, userId) {
  try {
    // Track message count
    const currentCount = messageCounters.get(userId) || 0;
    messageCounters.set(userId, currentCount + 1);
    
    console.log(`[WA] Processing message #${currentCount + 1} from ${message.from}: ${message.body}`);
    
    let response = '';
    
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
        console.log(`[WA] Found knowledge base match: ${results[0].item.keyword}`);
      }
    }

    // If no knowledge base match, use OpenAI for Pro users
    if (!response) {
      const freeMode = process.env.WHATSAPP_FREE_MODE === '1';
      const hasProPlan = true; // For testing, always allow OpenAI
      
      if (hasProPlan && !freeMode) {
        try {
          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "system",
                content: "You are a helpful WhatsApp bot assistant. Provide concise, helpful responses to user queries."
              },
              {
                role: "user",
                content: message.body
              }
            ],
            max_tokens: 150
          });
          response = completion.choices[0].message.content;
        } catch (openaiError) {
          console.error('OpenAI error:', openaiError);
          response = "I'm sorry, I'm having trouble processing your request right now. Please try again later.";
        }
      }
    }

    // Fallback response - only echo if there's actual content
    if (!response) {
      if (message.body && message.body.trim()) {
        response = `Echo: ${message.body.trim()}`;
      } else {
        response = 'Hello! How can I help you today?';
      }
    }

    // Send response immediately without delay
    if (response) {
      console.log(`[WA] responding to ${message.from} immediately (message #${currentCount + 1})`);
      
      const client = userClients.get(userId);
      if (client) {
        try {
          // Check if client is still connected without calling getState
          if (client.info && client.info.wid) {
            await client.sendMessage(message.from, response);
            console.log(`[WA] Response sent successfully to ${message.from} (message #${currentCount + 1})`);
            
            // Add a small delay to prevent rapid disconnections
            await new Promise(resolve => setTimeout(resolve, 500)); // Reduced delay
            
            // After every 3 messages, check if we need to restart the client
            if ((currentCount + 1) % 3 === 0) {
              console.log(`[WA] Message #${currentCount + 1} processed, checking client health...`);
              try {
                await client.getState();
                console.log(`[WA] Client health check passed for message #${currentCount + 1}`);
              } catch (healthError) {
                console.log(`[WA] Client health check failed for message #${currentCount + 1}, restarting...`);
                // Restart the client to ensure continuous operation
                setTimeout(() => {
                  if (userClients.has(userId)) {
                    console.log(`[WA] Restarting client after message #${currentCount + 1}...`);
                    try {
                      client.destroy();
                      userClients.delete(userId);
                      startWhatsAppSession({ user: { id: userId } }, { json: () => {} });
                    } catch (restartError) {
                      console.log(`[WA] Client restart failed:`, restartError.message);
                    }
                  }
                }, 1000);
              }
            }
          } else {
            console.log(`[WA] Client not ready, skipping response (message #${currentCount + 1})`);
            // Try to restart the client if it's not ready
            setTimeout(() => {
              if (!userClients.has(userId)) {
                console.log(`[WA] Restarting client after not ready state...`);
                startWhatsAppSession({ user: { id: userId } }, { json: () => {} });
              }
            }, 2000);
          }
        } catch (e) {
          console.error(`[WA] sendMessage failed for message #${currentCount + 1}:`, e);
          // Don't let send errors cause disconnections, but try to restart
          setTimeout(() => {
            if (!userClients.has(userId)) {
              console.log(`[WA] Restarting client after send error...`);
              startWhatsAppSession({ user: { id: userId } }, { json: () => {} });
            }
          }, 3000);
        }
      } else {
        // No client available, try to restart
        console.log(`[WA] No client available for message #${currentCount + 1}, restarting...`);
        setTimeout(() => {
          if (!userClients.has(userId)) {
            startWhatsAppSession({ user: { id: userId } }, { json: () => {} });
          }
        }, 1000);
      }
    }

  } catch (error) {
    console.error('Message handling error:', error);
  }
}

async function uploadKnowledgeBase(req, res) {
  try {
    const userId = req.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Read and parse Excel file
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel file is empty' });
    }

    // Clear existing knowledge base for this user
    await KnowledgeBase.destroy({ where: { userId } });

    // Process and save new entries
    const entries = [];
    for (const row of data) {
      // Support both 'keyword' and 'key' column names (case insensitive)
      const keyword = row.keyword || row.key || row.Keyword || row.Key;
      const answer = row.answer || row.Answer;

      if (keyword && answer) {
        entries.push({
          userId,
          keyword: keyword.toString().trim(),
          answer: answer.toString().trim(),
          isActive: true
        });
      }
    }

    if (entries.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid keyword-answer pairs found. Please ensure your Excel file has "keyword" (or "key") and "answer" columns.' 
      });
    }

    // Bulk create entries
    await KnowledgeBase.bulkCreate(entries);

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      message: `Successfully uploaded ${entries.length} knowledge base entries`,
      count: entries.length
    });

  } catch (error) {
    console.error('Knowledge base upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload knowledge base',
      error: error.message 
    });
  }
}

async function getKnowledgeBase(req, res) {
  try {
    const userId = req.userId;
    const entries = await KnowledgeBase.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      entries: entries.map(entry => ({
        id: entry.id,
        keyword: entry.keyword,
        answer: entry.answer,
        isActive: entry.isActive,
        createdAt: entry.createdAt
      }))
    });

  } catch (error) {
    console.error('Get knowledge base error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get knowledge base',
      error: error.message 
    });
  }
}

async function deleteKnowledgeEntry(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const entry = await KnowledgeBase.findOne({
      where: { id, userId }
    });

    if (!entry) {
      return res.status(404).json({ 
        success: false, 
        message: 'Knowledge base entry not found' 
      });
    }

    await entry.destroy();

    res.json({
      success: true,
      message: 'Knowledge base entry deleted successfully'
    });

  } catch (error) {
    console.error('Delete knowledge entry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete knowledge base entry',
      error: error.message 
    });
  }
}

async function getWhatsAppStatus(req, res) {
  try {
    const userId = req.userId;
    const client = userClients.get(userId);
    const state = userStates.get(userId);

    if (!client) {
      return res.json({
        success: true,
        status: 'disconnected',
        message: 'No active WhatsApp session'
      });
    }

    try {
      const clientState = await client.getState();
      res.json({
        success: true,
        status: clientState,
        message: clientState === 'CONNECTED' ? 'WhatsApp session is active' : 'WhatsApp session is not ready',
        initializing: state?.initializing || false
      });
    } catch (error) {
      res.json({
        success: true,
        status: 'error',
        message: 'Could not determine WhatsApp session status',
        error: error.message
      });
    }

  } catch (error) {
    console.error('Get WhatsApp status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get WhatsApp status',
      error: error.message 
    });
  }
}

module.exports = {
  startWhatsAppSession,
  uploadKnowledgeBase,
  getKnowledgeBase,
  deleteKnowledgeEntry,
  getWhatsAppStatus,
  upload
};