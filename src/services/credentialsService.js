const PlatformCredential = require('../models/platformCredential');

// Map env var names per platform for fallback
const ENV_MAP = {
  facebook: {
    clientId: () => process.env.FB_APP_ID || process.env.APP_ID,
    clientSecret: () => process.env.FB_APP_SECRET || process.env.APP_SECRET,
    redirectUri: () => process.env.FB_REDIRECT_URI || process.env.REDIRECT_URI,
  },
  instagram: {
    clientId: () => process.env.FB_APP_ID || process.env.APP_ID,
    clientSecret: () => process.env.FB_APP_SECRET || process.env.APP_SECRET,
    redirectUri: () => process.env.FB_REDIRECT_URI || process.env.REDIRECT_URI,
  },
  pinterest: {
    clientId: () => process.env.PINTEREST_APP_ID,
    clientSecret: () => process.env.PINTEREST_APP_SECRET,
    redirectUri: () => process.env.PINTEREST_REDIRECT_URI,
  },
  linkedin: {
    clientId: () => process.env.LINKEDIN_CLIENT_ID,
    clientSecret: () => process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: () => process.env.LINKEDIN_REDIRECT_URI,
  },
  tiktok: {
    clientId: () => process.env.TIKTOK_CLIENT_KEY,
    clientSecret: () => process.env.TIKTOK_CLIENT_SECRET,
    redirectUri: () => process.env.TIKTOK_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/tiktok/callback`,
  },
  twitter: {
    clientId: () => process.env.TWITTER_CLIENT_ID,
    clientSecret: () => process.env.TWITTER_CLIENT_SECRET,
    redirectUri: () => process.env.TWITTER_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/twitter/callback`,
  },
  youtube: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: () => process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/youtube/callback`,
  },
};

async function getClientCredentials(userId, platform) {
  if (!userId || !platform) return { clientId: undefined, clientSecret: undefined, redirectUri: undefined };
  // Prefer per-user DB credentials
  const row = await PlatformCredential.findOne({ where: { userId, platform } });
  if (row) {
    return {
      clientId: row.clientId || undefined,
      clientSecret: row.clientSecret || undefined,
      redirectUri: row.redirectUri || undefined,
    };
  }
  // Fallback to env
  const env = ENV_MAP[platform] || {};
  return {
    clientId: env.clientId ? env.clientId() : undefined,
    clientSecret: env.clientSecret ? env.clientSecret() : undefined,
    redirectUri: env.redirectUri ? env.redirectUri() : undefined,
  };
}

module.exports = { getClientCredentials };





