const express = require('express');
const router = express.Router();

// TikTok OAuth configuration
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:4000/auth/tiktok/callback';

// TikTok OAuth scopes
const TIKTOK_SCOPES = [
  'user.info.basic',
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
    
    // Store state in session or temporary storage (you might want to use Redis in production)
    // For now, we'll pass it as a query parameter to the frontend
    
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

module.exports = router;
