const axios = require('axios');
const TwitterAccount = require('../models/twitterAccount');
const { User } = require('../models/user');

async function exchangeCode(req, res) {
  try {
    const userId = req.user.id;
    const { code } = req.body || {};
    if (!code) {
      return res.status(400).json({ message: 'twitter code is required' });
    }

    const clientId = process.env.TWITTER_CLIENT_ID;
    const clientSecret = process.env.TWITTER_CLIENT_SECRET;
    const redirectUri = process.env.TWITTER_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/twitter/callback`;

    if (!clientId) {
      return res.status(500).json({ message: 'Twitter integration not configured' });
    }

    // PKCE code_verifier must be provided from prior auth step; allow fallback for now via env
    const codeVerifier = req.body.codeVerifier || process.env.TWITTER_CODE_VERIFIER;

    const params = new URLSearchParams();
    params.set('grant_type', 'authorization_code');
    params.set('code', code);
    params.set('redirect_uri', redirectUri);
    params.set('client_id', clientId);
    if (codeVerifier) params.set('code_verifier', codeVerifier);

    console.log('[Twitter OAuth] Exchanging code with params:', {
      hasCode: !!code,
      redirectUri,
      hasClientId: !!clientId,
      codeVerifierPresent: !!codeVerifier
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (clientSecret) {
      headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    }

    const tokenResp = await axios.post('https://api.twitter.com/2/oauth2/token', params, { headers });

    const { access_token, refresh_token, expires_in, scope, token_type } = tokenResp.data || {};

    // Fetch user info
    console.log('[Twitter OAuth] Token response:', {
      ok: true,
      hasAccessToken: !!access_token,
      hasRefreshToken: !!refresh_token,
      expiresIn: expires_in,
      scope
    });

    const meResp = await axios.get('https://api.twitter.com/2/users/me', {
      headers: { Authorization: `Bearer ${access_token}` },
      params: { 'user.fields': 'name,username,profile_image_url' }
    });
    const me = meResp.data?.data;

    let account = await TwitterAccount.findOne({ where: { userId } });
    if (!account) account = await TwitterAccount.create({ userId });

    account.twitterUserId = me?.id || account.twitterUserId;
    account.username = me?.username || account.username;
    account.name = me?.name || account.name;
    account.accessToken = access_token || null;
    account.refreshToken = refresh_token || null;
    account.expiresAt = expires_in ? new Date(Date.now() + Number(expires_in) * 1000) : null;
    account.scope = scope || null;
    account.isActive = true;
    await account.save();

    return res.json({ success: true, message: 'Twitter connected', account: { id: account.id, username: account.username } });
  } catch (err) {
    console.error('Twitter exchangeCode error:', {
      status: err?.response?.status,
      data: err?.response?.data,
      message: err?.message
    });
    return res.status(400).json({ success: false, message: err?.response?.data?.error || err.message || 'Twitter exchange failed' });
  }
}

async function disconnect(req, res) {
  try {
    const userId = req.user.id;
    const account = await TwitterAccount.findOne({ where: { userId } });
    if (!account) return res.json({ success: true, message: 'Not connected' });
    account.isActive = false;
    account.accessToken = null;
    account.refreshToken = null;
    await account.save();
    return res.json({ success: true, message: 'Twitter disconnected' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

async function createTweet(req, res) {
  try {
    const userId = req.user.id;
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ success: false, message: 'text is required' });

    const account = await TwitterAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) {
      return res.status(400).json({ success: false, message: 'Twitter not connected' });
    }

    const resp = await axios.post('https://api.twitter.com/2/tweets', { text }, {
      headers: { Authorization: `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' }
    });

    return res.json({ success: true, tweet: resp.data });
  } catch (err) {
    console.error('Twitter createTweet error:', err?.response?.data || err);
    return res.status(400).json({ success: false, message: err?.response?.data?.detail || err.message || 'Tweet failed' });
  }
}

module.exports = { exchangeCode, disconnect, createTweet };

