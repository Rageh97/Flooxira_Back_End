const { Router } = require('express');
const crypto = require('crypto');

const router = Router();

// Store OAuth state temporarily (in production, use Redis or database)
const oauthStates = new Map();

router.get('/facebook', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  oauthStates.set(state, { timestamp: Date.now() });
  
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
    `client_id=${process.env.FB_APP_ID}` +
    `&redirect_uri=${process.env.FB_REDIRECT_URI}` +
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
  
  // Simply redirect to frontend with the code for processing
  // This was working before - the frontend will call /api/facebook/exchange
  res.redirect(`${process.env.FRONTEND_URL}/settings?fb_code=${code}`);
});

module.exports = router;






