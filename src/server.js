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

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
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
app.use('/uploads', express.static('uploads'));

const port = Number(process.env.PORT) || 4000;

async function start() {
  await sequelize.authenticate();
  try {
    await sequelize.sync();
  } catch (err) {
    console.error('Sequelize sync failed:', err?.message || err);
    if (process.env.SQLITE_RESET === '1') {
      console.warn('SQLITE_RESET=1 detected — resetting DB with force sync (dev only)');
      await sequelize.sync({ force: true });
    } else {
      throw err;
    }
  }
  // Start scheduler after DB is ready
  try { require('./scheduler').startScheduler(); } catch {}
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
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


