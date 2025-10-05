require('dotenv').config();

// Fix SSL issues for LinkedIn API calls
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { sequelize } = require('./sequelize');
const authRoutes = require('./routes/auth.routes');
const postsRoutes = require('./routes/posts.routes');
const plansRoutes = require('./routes/plans.routes');
const facebookRoutes = require('./routes/facebook.routes');
const uploadsRoutes = require('./routes/uploads.routes');
const authCombinedRoutes = require('./routes/auth.combined');
const tiktokRoutes = require('./routes/tiktok.routes');
const whatsappRoutes = require('./routes/whatsapp.routes');
const youtubeRoutes = require('./routes/youtube.routes');
const sallaRoutes = require('./routes/salla.routes');
const linkedinRoutes = require('./routes/linkedin.routes');
const pinterestRoutes = require('./routes/pinterest.routes');
const twitterRoutes = require('./routes/twitter.routes');
const adminRoutes = require('./routes/admin.routes');
const telegramBotRoutes = require('./routes/telegram.bot.routes');
const telegramTemplateRoutes = require('./routes/telegramTemplate.routes');
const contentRoutes = require('./routes/content.routes');
const botRoutes = require('./routes/bot.routes');
const botSettingsRoutes = require('./routes/botSettings.routes');
const botControlRoutes = require('./routes/botControl.routes');
const whatsappTemplateRoutes = require('./routes/whatsappTemplate.routes');
const tagRoutes = require('./routes/tag.routes');
const mediaRoutes = require('./routes/media.routes');
const campaignRoutes = require('./routes/campaign.routes');
const conversationService = require('./services/conversationService');
const axios = require('axios');

// Import models to ensure they're registered before sync
require('./models/telegramBotAccount');
require('./models/telegramChat');
require('./models/botSettings');
require('./models/botField');
require('./models/botData');
require('./models/whatsappTemplate');
require('./models/telegramTemplate');
require('./models/user');

const app = express();
// CORS configuration - comprehensive setup
const allowedOrigins = [
  'https://www.flooxira.com',
  'https://flooxira.com',
  'http://localhost:3000',
  'http://localhost:3001'
];

app.use((req, res, next) => {
  console.log('Request origin:', req.headers.origin);
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);
  
  const origin = req.headers.origin;
  
  // Set CORS headers
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // Allow requests with no origin (like Postman, curl)
    res.header('Access-Control-Allow-Origin', '*');
  } else {
    console.log('CORS blocked origin:', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Requested-With, Accept');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Handling preflight request');
    res.status(200).end();
    return;
  }
  
  next();
});

// Capture raw body for webhook signature verification (only for non-multipart requests)
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';
  
  // Skip body parsing for multipart/form-data (handled by multer)
  if (contentType.includes('multipart/form-data')) {
    return next();
  }
  
  let data = '';
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try {
      if (contentType.includes('application/json') && data) {
        req.body = JSON.parse(data);
      }
    } catch {
      // leave body as is if parsing fails
    }
    next();
  });
});
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/test-cors', (_req, res) => {
  res.json({ 
    message: 'CORS test successful', 
    timestamp: new Date().toISOString(),
    origin: _req.headers.origin 
  });
});

// Handle OPTIONS requests for all API routes
app.options('/api/*', (req, res) => {
  console.log('Handling API preflight request for:', req.url);
  res.status(200).end();
});

app.use('/api/auth', authRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/facebook', facebookRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/auth', authCombinedRoutes); // Mount at /auth to create /auth/facebook and /auth/tiktok endpoints
app.use('/api/tiktok', tiktokRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/salla', sallaRoutes);
app.use('/api/linkedin', linkedinRoutes);
app.use('/api/pinterest', pinterestRoutes);
app.use('/api/twitter', twitterRoutes);
app.use('/api/telegram-bot', telegramBotRoutes);
app.use('/api/telegram-templates', telegramTemplateRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/platforms', require('./routes/platforms.routes'));
app.use('/api/bot', botRoutes);
app.use('/api/bot-settings', botSettingsRoutes);
app.use('/api/bot-control', botControlRoutes);
app.use('/api/whatsapp-templates', whatsappTemplateRoutes);
app.use('/api', tagRoutes);
app.use('/api', mediaRoutes);
app.use('/api', campaignRoutes);
app.use('/api/content', contentRoutes);
app.use('/uploads', express.static('uploads'));

// Lightweight endpoint for Facebook connect with tester handling
app.post('/connect-facebook', async (req, res) => {
  try {
    const { authCode, facebookUserId } = req.body || {};
    if (!authCode) {
      return res.status(400).json({ status: 'error', message: 'authCode is required' });
    }

    const APP_ID = process.env.FB_APP_ID || process.env.APP_ID;
    const APP_SECRET = process.env.FB_APP_SECRET || process.env.APP_SECRET;
    const REDIRECT_URI = process.env.FB_REDIRECT_URI || process.env.REDIRECT_URI;

    if (!APP_ID || !APP_SECRET || !REDIRECT_URI) {
      console.error('Missing Facebook app configuration');
      return res.status(500).json({ status: 'error', message: 'Server configuration error' });
    }

    try {
      // 1) Exchange code for short-lived token
      const tokenResp = await axios.post(
        'https://graph.facebook.com/v21.0/oauth/access_token',
        new URLSearchParams({
          client_id: APP_ID,
          client_secret: APP_SECRET,
          redirect_uri: REDIRECT_URI,
          code: authCode
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
      );

      const accessToken = tokenResp.data?.access_token;

      // 2) Fetch user profile
      const meResp = await axios.get('https://graph.facebook.com/v21.0/me', {
        params: { access_token: accessToken, fields: 'id,name,email' },
        timeout: 15000
      });

      return res.json({ status: 'success', user: meResp.data });
    } catch (err) {
      const status = err?.response?.status;
      const fbErr = err?.response?.data?.error;
      const message = fbErr?.message || err?.message || 'Facebook error';
      console.error('Facebook connect error:', { status, message, fbErr });

      // Handle development mode case
      const isDevMode = status === 403 && /development mode/i.test(message || '');
      if (isDevMode && facebookUserId) {
        try {
          const appAccessToken = `${APP_ID}|${APP_SECRET}`;
          await axios.post(
            `https://graph.facebook.com/${APP_ID}/roles`,
            new URLSearchParams({ user: String(facebookUserId), role: 'testers' }),
            { params: { access_token: appAccessToken }, timeout: 15000 }
          );
          return res.json({ status: 'pending', message: 'تمت إضافتك كتستر.. أعد المحاولة بعد قليل' });
        } catch (addErr) {
          const addStatus = addErr?.response?.status;
          const addMsg = addErr?.response?.data?.error?.message || addErr?.message;
          console.error('Add tester failed:', { addStatus, addMsg });
          return res.json({
            status: 'invite',
            message: 'تمت دعوتك كتستر.. افتح صفحة الدعوات على فيسبوك وقم بالقبول',
            acceptUrl: `https://developers.facebook.com/apps/${APP_ID}/roles/testers/`
          });
        }
      }

      // Other errors
      return res.status(400).json({ status: 'error', message });
    }
  } catch (e) {
    console.error('Unhandled /connect-facebook error:', e);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
});

// Endpoint to invite a tester directly when OAuth login is blocked
// app.post('/connect-facebook/invite', async (req, res) => {
//   try {
//     const { facebookUserId } = req.body || {};
//     const APP_ID = process.env.FB_APP_ID || process.env.APP_ID;
//     const APP_SECRET = process.env.FB_APP_SECRET || process.env.APP_SECRET;
//     if (!APP_ID || !APP_SECRET) {
//       console.error('Missing Facebook app configuration');
//       return res.status(500).json({ status: 'error', message: 'Server configuration error' });
//     }
//     if (!facebookUserId) {
//       return res.status(400).json({ status: 'error', message: 'facebookUserId is required' });
//     }
//     try {
//       const appAccessToken = `${APP_ID}|${APP_SECRET}`;
//       await axios.post(
//         `https://graph.facebook.com/${APP_ID}/roles`,
//         new URLSearchParams({ user: String(facebookUserId), role: 'testers' }),
//         { params: { access_token: appAccessToken }, timeout: 15000 }
//       );
//       return res.json({ status: 'pending', message: 'تمت إضافتك كتستر.. أعد المحاولة بعد قليل' });
//     } catch (err) {
//       const addStatus = err?.response?.status;
//       const addMsg = err?.response?.data?.error?.message || err?.message;
//       console.error('Direct tester invite failed:', { addStatus, addMsg });
//       return res.json({
//         status: 'invite',
//         message: 'تمت دعوتك كتستر.. افتح صفحة الدعوات على فيسبوك وقم بالقبول',
//         acceptUrl: `https://developers.facebook.com/apps/${APP_ID}/roles/testers/`
//       });
//     }
//   } catch (e) {
//     console.error('Unhandled /connect-facebook/invite error:', e);
//     return res.status(500).json({ status: 'error', message: 'Internal server error' });
//   }
// });

const port = process.env.PORT || 4000;

async function start() {
  await sequelize.authenticate();
  // Ensure critical schema migrations without destructive force
  try {
    const isMySQL = (process.env.DB_DIALECT || '').toLowerCase() === 'mysql';
    if (isMySQL) {
      // Upgrade tiktok_accounts.profilePicture to TEXT if still VARCHAR(255)
      const qi = sequelize.getQueryInterface();
      const table = 'tiktok_accounts';
      let desc;
      try {
        desc = await qi.describeTable(table);
      } catch {}
      const col = desc && desc.profilePicture;
      const typeStr = String(col && col.type || '').toLowerCase();
      if (col && /varchar\(\d+\)/.test(typeStr)) {
        console.log('Altering column tiktok_accounts.profilePicture to TEXT');
        await sequelize.query('ALTER TABLE `tiktok_accounts` MODIFY `profilePicture` TEXT NULL');
      }
    }
  } catch (migErr) {
    console.warn('Non-fatal schema migration step failed:', migErr?.message || migErr);
  }
  try {
    // Database sync mode: 'alter' (default) or 'force'
    // IMPORTANT: 'alter' mode preserves existing data while updating schema
    // 'force' mode DROPS ALL TABLES and recreates them (DATA LOSS!)
    const dbSyncMode = (process.env.DB_SYNC_MODE || 'alter').toLowerCase();
    let useForce = dbSyncMode === 'force';
    let useAlter = dbSyncMode === 'alter';
    const allowForceInProd = String(process.env.ALLOW_FORCE_SYNC || '').trim() === '1';
    
    // Safety check: prevent accidental force sync in production
    if (useForce && process.env.NODE_ENV === 'production' && !allowForceInProd) {
      console.error('❌ FORCE SYNC BLOCKED: Cannot use force sync in production!');
      console.log('🔄 Falling back to ALTER mode to preserve data...');
      useAlter = true;
      useForce = false;
    }
    
    let syncOptions = {};
    
    if (useForce) {
      console.log('🔥 FORCE SYNC: Dropping and recreating ALL tables...');
      console.log('⚠️  WARNING: This will DELETE ALL DATA!');
      syncOptions = { force: true };

    // Clean up legacy tables that might have FKs blocking drops (from removed Telegram models)
    try {
      const qi = sequelize.getQueryInterface();
      const legacyTables = ['telegram_chats', 'telegram_accounts', 'telegram_schedules', 'telegram_sessions'];
      for (const t of legacyTables) {
        try {
          // Drop foreign keys referencing users if needed
          // Best-effort: attempt direct drop; MySQL will handle IF EXISTS
          await sequelize.query(`DROP TABLE IF EXISTS \`${t}\``);
        } catch (dropErr) {
          console.warn(`[DB] Could not drop legacy table ${t}:`, dropErr?.message || dropErr);
        }
      }
    } catch (legacyErr) {
      console.warn('[DB] Legacy cleanup skipped:', legacyErr?.message || legacyErr);
      }
    } else if (useAlter) {
      console.log('🔄 ALTER SYNC: Updating existing tables to match models...');
      console.log('✅ This will preserve existing data while updating schema');
      
      // For SQLite, we need to handle foreign key constraints carefully
      if (process.env.DB_DIALECT === 'sqlite') {
        console.log('🔧 SQLite detected: Using safe alter mode with foreign key handling...');
        
        // Disable foreign key constraints temporarily for SQLite
        await sequelize.query('PRAGMA foreign_keys=OFF');
        
        try {
          syncOptions = { alter: true };
          await sequelize.sync(syncOptions);
        } catch (alterError) {
          console.warn('⚠️  ALTER SYNC failed, trying fallback approach...', alterError.message);
          
          // Check if it's a constraint error (common with SQLite)
          if (alterError.name === 'SequelizeForeignKeyConstraintError' || 
              alterError.name === 'SequelizeUniqueConstraintError' ||
              alterError.message.includes('SQLITE_CONSTRAINT')) {
            console.log('🔧 Constraint error detected - using safe fallback...');
          }
          
          // Fallback: try normal sync (create missing tables only)
          console.log('🔄 FALLBACK: Creating missing tables only...');
          syncOptions = {};
          await sequelize.sync(syncOptions);
        } finally {
          // Re-enable foreign key constraints
          await sequelize.query('PRAGMA foreign_keys=ON');
        }
      } else {
        syncOptions = { alter: true };
        await sequelize.sync(syncOptions);
      }
    } else {
      console.log('📋 NORMAL SYNC: Creating tables if they don\'t exist...');
      console.log('✅ This will only create missing tables');
      syncOptions = {};
    await sequelize.sync(syncOptions);
    }
    
    if (syncOptions.force) {
      console.log('✅ FORCE SYNC COMPLETED: All tables dropped and recreated!');
    } else if (syncOptions.alter) {
      console.log('✅ ALTER SYNC COMPLETED: Tables updated to match models!');
    } else {
      console.log('✅ SYNC COMPLETED: Database synchronized!');
    }
  } catch (err) {
    console.error('Sequelize sync failed:', err?.stack || err);
    if (process.env.NODE_ENV === 'development' && process.env.SQLITE_RESET === '1') {
      console.warn('Resetting DB with force sync (dev only)');
      await sequelize.sync({ force: true });
    } else {
      throw err;
    }
  }
  // Start scheduler after DB is ready
  try { require('./scheduler').startScheduler(); } catch {}
  
  // Clean old conversations every 24 hours
  setInterval(async () => {
    try {
      await conversationService.cleanOldConversations();
      console.log('[Server] Old conversations cleaned');
    } catch (error) {
      console.error('[Server] Failed to clean old conversations:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
  
  app.listen(port, '0.0.0.0', () => {
    console.log(`API listening on ${port}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});

// Global hardening for unhandled rejections/exceptions (e.g., EBUSY on Windows)
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  // Avoid crashing on transient Windows file locking issues
  if (String(err?.message || '').includes('EBUSY')) {
    console.error('Non-fatal EBUSY error caught:', err?.message || err);
    return;
  }
  console.error('Uncaught Exception:', err);
});


