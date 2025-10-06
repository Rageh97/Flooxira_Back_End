const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { google } = require('googleapis');

// Store OAuth state temporarily (in production, use Redis or database)
const oauthStates = new Map();

// ===== FACEBOOK OAUTH ROUTES =====

// ===== FACEBOOK OAUTH ROUTES =====

router.get('/facebook', async (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  const userId = req.query.userId; // Get userId from query parameter
  
  if (!userId) {
    return res.status(400).json({ error: 'userId parameter is required' });
  }
  
  oauthStates.set(state, { timestamp: Date.now(), userId });
  
  // Get user's Facebook app credentials
  const { getClientCredentials } = require('../services/credentialsService');
  const { clientId, redirectUri } = await getClientCredentials(parseInt(userId), 'facebook');
  
  if (!clientId || !redirectUri) {
    return res.status(400).json({ error: 'Facebook app credentials not configured for this user' });
  }
  
  // Include Facebook permissions for posting to pages and Instagram
  const scopes = [
    'pages_manage_posts',
    'pages_read_engagement', 
    'pages_show_list',
    'public_profile',
    'email',
    'pages_manage_metadata',
    'instagram_basic',
    'instagram_manage_insights',
    'instagram_content_publish'
  ].join(',');
  
  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${state}` +
    `&scope=${scopes}` +
    `&auth_type=rerequest`;
    
  console.log('Initiating Facebook OAuth with scopes:', scopes);
  res.redirect(authUrl);
});

router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error('OAuth error:', error);
    return res.redirect(`${process.env.FRONTEND_URL}/settings?error=oauth_denied`);
  }
  
  if (!code) {
    console.error('No code received');
    return res.redirect(`${process.env.FRONTEND_URL}/settings?error=missing_code`);
  }
  
  // Validate state
  const storedState = oauthStates.get(state);
  if (!storedState) {
    console.error('Invalid state');
    return res.redirect(`${process.env.FRONTEND_URL}/settings?error=invalid_state`);
  }
  
  // Clean up state
  oauthStates.delete(state);
  
  // Check if state is not too old (5 minutes)
  if (Date.now() - storedState.timestamp > 5 * 60 * 1000) {
    console.error('State expired');
    return res.redirect(`${process.env.FRONTEND_URL}/settings?error=state_expired`);
  }
  
  console.log('Facebook OAuth callback successful, redirecting with code');
  
  // Check if this was an Instagram OAuth request
  const platform = storedState.platform || 'facebook';
  
  // Simply redirect to frontend with the code for processing
  // This was working before - the frontend will call /api/facebook/exchange
  res.redirect(`${process.env.FRONTEND_URL}/settings?platform=${platform}&fb_code=${code}`);
});

// ===== INSTAGRAM OAUTH ROUTES =====
// Instagram uses Facebook OAuth with Instagram scopes

router.get('/instagram', async (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  const userId = req.query.userId; // Get userId from query parameter
  
  if (!userId) {
    return res.status(400).json({ error: 'userId parameter is required' });
  }
  
  oauthStates.set(state, { timestamp: Date.now(), platform: 'instagram', userId });
  
  // Get user's Facebook app credentials (Instagram uses Facebook OAuth)
  const { getClientCredentials } = require('../services/credentialsService');
  const { clientId, redirectUri } = await getClientCredentials(parseInt(userId), 'facebook');
  
  if (!clientId || !redirectUri) {
    return res.status(400).json({ error: 'Facebook app credentials not configured for this user' });
  }
  
  // Include Instagram-specific permissions
  const scopes = [
    'instagram_basic',
    'instagram_manage_insights',
    'instagram_content_publish',
    'pages_manage_posts',
    'pages_read_engagement', 
    'pages_show_list',
    'public_profile',
    'email',
    'pages_manage_metadata'
  ].join(',');
  
  const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
    `client_id=${clientId}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${state}` +
    `&scope=${scopes}` +
    `&auth_type=rerequest`;
    
  console.log('Initiating Instagram OAuth with scopes:', scopes);
  res.redirect(authUrl);
});

// ===== YOUTUBE (GOOGLE) OAUTH ROUTES =====

router.get('/youtube', (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/youtube/callback`;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ message: 'YouTube integration not configured' });
    }
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { timestamp: Date.now() });
    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
      'openid',
      'email',
      'profile'
    ];
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state
    });
    return res.redirect(url);
  } catch (err) {
    console.error('Failed to start YouTube OAuth:', err);
    return res.status(500).json({ message: 'Failed to start YouTube OAuth' });
  }
});

router.get('/youtube/callback', (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=youtube_oauth_failed`);
  }
  const s = oauthStates.get(state);
  if (!s) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=invalid_state`);
  }
  oauthStates.delete(state);
  if (Date.now() - s.timestamp > 5 * 60 * 1000) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=state_expired`);
  }
  return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?platform=youtube&youtube_code=${encodeURIComponent(code)}`);
});


// ===== TIKTOK OAUTH ROUTES =====

// TikTok OAuth configuration
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:4000/auth/tiktok/callback';

// TikTok OAuth scopes
const TIKTOK_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'user.info.stats',
  'video.list',
  'video.upload'
].join(',');



// Generate random state for CSRF protection
function generateState() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Start TikTok OAuth flow
router.get('/tiktok', (req, res) => {
  try {
    if (!TIKTOK_CLIENT_KEY || !TIKTOK_CLIENT_SECRET) {
      console.error('TikTok credentials not configured');
      return res.status(500).json({ 
        error: 'TikTok integration not configured',
        message: 'Please configure TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET in environment variables'
      });
    }

    // Generate state for CSRF protection
    const state = generateState();
    
    // Build TikTok authorization URL (v2)
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.set('client_key', TIKTOK_CLIENT_KEY);
    authUrl.searchParams.set('scope', TIKTOK_SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', TIKTOK_REDIRECT_URI);
    authUrl.searchParams.set('state', state);
    
    console.log('TikTok OAuth URL generated:', authUrl.toString());
    
    // Redirect to TikTok authorization
    res.redirect(authUrl.toString());
    
  } catch (error) {
    console.error('Error starting TikTok OAuth:', error);
    res.status(500).json({ 
      error: 'Failed to start TikTok OAuth',
      message: error.message 
    });
  }
});

// TikTok OAuth callback
router.get('/tiktok/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    console.log('TikTok OAuth callback received:', { code: code ? 'present' : 'missing', state, error });
    
    if (error) {
      console.error('TikTok OAuth error:', error);
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=tiktok_oauth_failed&message=${encodeURIComponent(error)}`);
    }
    
    if (!code) {
      console.error('TikTok OAuth callback missing code');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=tiktok_oauth_failed&message=${encodeURIComponent('Authorization code not received')}`);
    }
    
    // Redirect to frontend with the authorization code
    // The frontend will handle the token exchange
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?platform=tiktok&tiktok_code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`;
    
    console.log('Redirecting to frontend with TikTok code:', redirectUrl);
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Error handling TikTok OAuth callback:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=tiktok_oauth_failed&message=${encodeURIComponent('Internal server error')}`);
  }
});

// ===== SALLA OAUTH ROUTES =====

router.get('/salla', (req, res) => {
  try {
    const clientId = process.env.SALLA_CLIENT_ID;
    // Use the SAME redirect as token exchange and Salla app registered redirect
    const redirectUri = process.env.SALLA_OAUTH_REDIRECT || `${process.env.API_URL || 'http://localhost:4000'}/auth/salla/callback`;
    if (!clientId) return res.status(500).json({ message: 'Salla integration not configured' });
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { timestamp: Date.now() });
    const authUrl = new URL('https://accounts.salla.sa/oauth2/auth');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    // If SALLA_SCOPES is provided, use it; otherwise omit to use app's default granted scopes
    const scopes = (process.env.SALLA_SCOPES || '').trim();
    if (scopes && !scopes.includes('products.write')) {
      authUrl.searchParams.set('scope', scopes);
    }
    // If scopes include products.write, skip scope parameter to avoid invalid_scope error
    authUrl.searchParams.set('state', state);
    return res.redirect(authUrl.toString());
  } catch (err) {
    console.error('Failed to start Salla OAuth:', err);
    return res.status(500).json({ message: 'Failed to start Salla OAuth' });
  }
});

router.get('/salla/callback', (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    console.error('Salla OAuth error:', error, error_description || '');
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=salla_oauth_failed&message=${encodeURIComponent(String(error_description || error))}`);
  }
  const s = oauthStates.get(state);
  if (!s) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=invalid_state`);
  }
  oauthStates.delete(state);
  if (Date.now() - s.timestamp > 5 * 60 * 1000) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=state_expired`);
  }
  return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?platform=salla&salla_code=${encodeURIComponent(code)}`);
});

// ===== LINKEDIN OAUTH ROUTES =====

router.get('/linkedin', (req, res) => {
  try {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/linkedin/callback`;
    
    if (!clientId) {
      console.error('LinkedIn credentials not configured');
      return res.status(500).json({ 
        error: 'LinkedIn integration not configured',
        message: 'Please configure LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in environment variables'
      });
    }

    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { timestamp: Date.now() });

    // LinkedIn OAuth scopes - using OpenID Connect for user ID
    const scopes = [
      'openid',                  // OpenID Connect
      'profile',                 // Basic profile information (OpenID Connect)
      'email',                   // Email address access
      'w_member_social'          // Post content to LinkedIn
    ].join(' ');

    const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', scopes);

    console.log('LinkedIn OAuth URL generated:', authUrl.toString());
    res.redirect(authUrl.toString());
    
  } catch (error) {
    console.error('Error starting LinkedIn OAuth:', error);
    res.status(500).json({ 
      error: 'Failed to start LinkedIn OAuth',
      message: error.message 
    });
  }
});

router.get('/linkedin/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    
    console.log('LinkedIn OAuth callback received:', { code: code ? 'present' : 'missing', state, error });
    
    if (error) {
      console.error('LinkedIn OAuth error:', error, error_description || '');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=linkedin_oauth_failed&message=${encodeURIComponent(error_description || error)}`);
    }
    
    if (!code) {
      console.error('LinkedIn OAuth callback missing code');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=linkedin_oauth_failed&message=${encodeURIComponent('Authorization code not received')}`);
    }
    
    // Validate state
    const storedState = oauthStates.get(state);
    if (!storedState) {
      console.error('Invalid LinkedIn OAuth state');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=invalid_state`);
    }
    
    // Clean up state
    oauthStates.delete(state);
    
    // Check if state is not too old (5 minutes)
    if (Date.now() - storedState.timestamp > 5 * 60 * 1000) {
      console.error('LinkedIn OAuth state expired');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=state_expired`);
    }
    
    // Redirect to frontend with the authorization code
    // The frontend will handle the token exchange
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?platform=linkedin&linkedin_code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`;
    
    console.log('Redirecting to frontend with LinkedIn code:', redirectUrl);
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Error handling LinkedIn OAuth callback:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=linkedin_oauth_failed&message=${encodeURIComponent('Internal server error')}`);
  }
});

// ===== TWITTER OAUTH (AUTHORIZATION URL ONLY) =====

router.get('/twitter', (req, res) => {
  try {
    const clientId = process.env.TWITTER_CLIENT_ID;
    const redirectUri = process.env.TWITTER_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/twitter/callback`;
    if (!clientId) {
      return res.status(500).json({ message: 'Twitter integration not configured' });
    }

    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { timestamp: Date.now() });

    // PKCE
    const codeVerifier = crypto.randomBytes(32).toString('hex');
    const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const challenge = base64url(require('crypto').createHash('sha256').update(codeVerifier).digest());
    oauthStates.set(`tw:${state}`, { codeVerifier, createdAt: Date.now() });

    const scopes = [
      'tweet.read',
      'tweet.write',
      'users.read',
      'offline.access'
    ].join(' ');

    const url = new URL('https://twitter.com/i/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', scopes);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');

    console.log('[Twitter OAuth] Authorize URL:', url.toString());
    return res.redirect(url.toString());
  } catch (err) {
    console.error('Failed to start Twitter OAuth:', err);
    return res.status(500).json({ message: 'Failed to start Twitter OAuth' });
  }
});

router.get('/twitter/callback', (req, res) => {
  const { code, state, error, error_description } = req.query || {};
  console.log('[Twitter OAuth] Callback hit with query:', { codePresent: !!code, state, error, error_description });
  if (error) {
    const msg = encodeURIComponent(error_description || error);
    const front = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${front}/settings?platform=twitter&error=${msg}`);
  }
  const st = oauthStates.get(`tw:${state}`);
  const codeVerifier = st?.codeVerifier;
  if (!state || !oauthStates.has(state)) {
    return res.redirect(`/settings?platform=twitter&error=invalid_state`);
  }
  oauthStates.delete(state);
  const front = process.env.FRONTEND_URL || 'http://localhost:3000';
  const redirectUrl = `${front}/settings?platform=twitter&twitter_code=${encodeURIComponent(code || '')}&code_verifier=${encodeURIComponent(codeVerifier || '')}`;
  console.log('[Twitter OAuth] Redirecting back to frontend:', redirectUrl);
  return res.redirect(redirectUrl);
});

// ===== PINTEREST OAUTH ROUTES =====

router.get('/pinterest', async (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId parameter is required' });
    }
    
    // Get user's Pinterest app credentials
    const { getClientCredentials } = require('../services/credentialsService');
    const { clientId, redirectUri } = await getClientCredentials(parseInt(userId), 'pinterest');
    
    if (!clientId || !redirectUri) {
      return res.status(400).json({ 
        error: 'Pinterest app credentials not configured for this user',
        message: 'Please configure Pinterest app credentials in settings'
      });
    }

    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, { timestamp: Date.now(), userId });

    // Pinterest OAuth scopes (include boards:write for pin creation)
    const scopes = [
      'boards:read',
      'boards:write',
      'pins:read', 
      'pins:write',
      'user_accounts:read'
    ].join(',');

    const authUrl = new URL('https://www.pinterest.com/oauth/');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes);
    authUrl.searchParams.set('state', state);

    console.log('Pinterest OAuth URL generated:', authUrl.toString());
    res.redirect(authUrl.toString());
    
  } catch (error) {
    console.error('Error starting Pinterest OAuth:', error);
    res.status(500).json({ 
      error: 'Failed to start Pinterest OAuth',
      message: error.message 
    });
  }
});

router.get('/pinterest/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    
    console.log('Pinterest OAuth callback received:', { code: code ? 'present' : 'missing', state, error });
    
    if (error) {
      console.error('Pinterest OAuth error:', error, error_description || '');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=pinterest_oauth_failed&message=${encodeURIComponent(error_description || error)}`);
    }
    
    if (!code) {
      console.error('Pinterest OAuth callback missing code');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=pinterest_oauth_failed&message=${encodeURIComponent('Authorization code not received')}`);
    }
    
    // Validate state
    const storedState = oauthStates.get(state);
    if (!storedState) {
      console.error('Invalid Pinterest OAuth state');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=invalid_state`);
    }
    
    // Clean up state
    oauthStates.delete(state);
    
    // Check if state is not too old (5 minutes)
    if (Date.now() - storedState.timestamp > 5 * 60 * 1000) {
      console.error('Pinterest OAuth state expired');
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=state_expired`);
    }
    
    // Redirect to frontend with the authorization code
    // The frontend will handle the token exchange
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?platform=pinterest&pinterest_code=${encodeURIComponent(code)}&state=${encodeURIComponent(state || '')}`;
    
    console.log('Redirecting to frontend with Pinterest code:', redirectUrl);
    res.redirect(redirectUrl);
    
  } catch (error) {
    console.error('Error handling Pinterest OAuth callback:', error);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?error=pinterest_oauth_failed&message=${encodeURIComponent('Internal server error')}`);
  }
});

module.exports = router;
