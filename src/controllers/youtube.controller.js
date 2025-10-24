const { google } = require('googleapis');
const YouTubeAccount = require('../models/youtubeAccount');

function getOAuthClient(userId) {
  const { getClientCredentials } = require('../services/credentialsService');
  const envClientId = process.env.GOOGLE_CLIENT_ID;
  const envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const envRedirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/youtube/callback`;
  // Build with env first; we will override per request if DB creds exist
  const client = new google.auth.OAuth2(envClientId, envClientSecret, envRedirectUri);
  client._getPerUserCreds = async () => {
    const { clientId, clientSecret, redirectUri } = await getClientCredentials(userId, 'youtube');
    return { clientId: clientId || envClientId, clientSecret: clientSecret || envClientSecret, redirectUri: redirectUri || envRedirectUri };
  };
  return client;
}

async function exchangeCode(req, res) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Missing code' });

    const oauth2Client = getOAuthClient(req.userId);
    const per = await oauth2Client._getPerUserCreds();
    oauth2Client._clientId = per.clientId;
    oauth2Client._clientSecret = per.clientSecret;
    oauth2Client.redirectUri = per.redirectUri;
    
    // Set the correct scopes for YouTube API
    oauth2Client.scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube',
      'https://www.googleapis.com/auth/youtube.readonly'
    ];
    
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    const email = me.data.email;
    const googleUserId = me.data.id;

    // Fetch default channel info
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelsResp = await youtube.channels.list({ mine: true, part: ['id', 'snippet'] });
    const channel = channelsResp.data.items?.[0];

    const [account, created] = await YouTubeAccount.findOrCreate({
      where: { userId: req.userId },
      defaults: {
        userId: req.userId,
        googleUserId,
        email,
        channelId: channel?.id || null,
        channelTitle: channel?.snippet?.title || null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        lastSyncAt: new Date()
      }
    });

    if (!created) {
      account.googleUserId = googleUserId;
      account.email = email;
      account.channelId = channel?.id || null;
      account.channelTitle = channel?.snippet?.title || null;
      if (tokens.access_token) account.accessToken = tokens.access_token;
      if (tokens.refresh_token) account.refreshToken = tokens.refresh_token;
      account.expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;
      account.isActive = true;
      account.lastSyncAt = new Date();
      await account.save();
    }

    return res.json({
      success: true,
      message: 'YouTube account connected successfully. Please select your YouTube channel.',
      account: {
        id: account.id,
        email: account.email
      }
    });
  } catch (err) {
    console.error('YouTube exchange error:', err);
    return res.status(500).json({ message: 'Failed to exchange YouTube code', error: err.message });
  }
}

async function getYouTubeAccount(req, res) {
  try {
    const account = await YouTubeAccount.findOne({ where: { userId: req.userId } });
    if (!account) return res.status(404).json({ message: 'No YouTube account connected' });
    return res.json({
      id: account.id,
      email: account.email,
      channelId: account.channelId,
      channelTitle: account.channelTitle,
      isActive: account.isActive,
      lastSyncAt: account.lastSyncAt
    });
  } catch (err) {
    console.error('YouTube get account error:', err);
    return res.status(500).json({ message: 'Failed to get YouTube account' });
  }
}

async function disconnectYouTube(req, res) {
  try {
    const account = await YouTubeAccount.findOne({ where: { userId: req.userId } });
    if (!account) return res.status(404).json({ message: 'No YouTube account connected' });
    await account.destroy();
    return res.json({ success: true });
  } catch (err) {
    console.error('YouTube disconnect error:', err);
    return res.status(500).json({ message: 'Failed to disconnect YouTube' });
  }
}

async function getYouTubeChannels(req, res) {
  try {
    const account = await YouTubeAccount.findOne({ where: { userId: req.userId } });
    if (!account) return res.status(404).json({ message: 'No YouTube account connected' });
    
    const oauth2Client = getOAuthClient(req.userId);
    const per = await oauth2Client._getPerUserCreds();
    oauth2Client._clientId = per.clientId;
    oauth2Client._clientSecret = per.clientSecret;
    oauth2Client.redirectUri = per.redirectUri;
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken
    });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelsResp = await youtube.channels.list({ 
      mine: true, 
      part: ['id', 'snippet', 'statistics'] 
    });
    
    if (channelsResp.data.items && channelsResp.data.items.length > 0) {
      const channels = channelsResp.data.items.map(channel => ({
        id: channel.id,
        title: channel.snippet.title,
        description: channel.snippet.description,
        thumbnail: channel.snippet.thumbnails?.default?.url,
        subscriberCount: channel.statistics?.subscriberCount || 0,
        videoCount: channel.statistics?.videoCount || 0
      }));
      
      return res.json({ channels });
    } else {
      return res.json({ channels: [] });
    }
  } catch (err) {
    console.error('YouTube channels error:', err);
    return res.status(500).json({ message: 'Failed to get YouTube channels', error: err.message });
  }
}

async function selectYouTubeChannel(req, res) {
  try {
    const { channelId, channelTitle } = req.body;
    if (!channelId) return res.status(400).json({ message: 'Channel ID is required' });
    
    const account = await YouTubeAccount.findOne({ where: { userId: req.userId } });
    if (!account) return res.status(404).json({ message: 'No YouTube account connected' });
    
    account.channelId = channelId;
    account.channelTitle = channelTitle;
    await account.save();
    
    return res.json({
      success: true,
      message: 'YouTube channel selected successfully',
      channel: {
        id: channelId,
        title: channelTitle
      }
    });
  } catch (err) {
    console.error('YouTube channel selection error:', err);
    return res.status(500).json({ message: 'Failed to select YouTube channel', error: err.message });
  }
}

async function testYouTubeConnection(req, res) {
  try {
    const account = await YouTubeAccount.findOne({ where: { userId: req.userId } });
    if (!account) return res.status(404).json({ message: 'No YouTube account connected' });
    const oauth2Client = getOAuthClient();
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken
    });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const channelsResp = await youtube.channels.list({ mine: true, part: ['id'] });
    const ok = channelsResp.status === 200;
    return res.json({ success: ok });
  } catch (err) {
    console.error('YouTube test error:', err);
    return res.status(500).json({ message: 'YouTube API test failed', error: err.message });
  }
}

// Get YouTube channel details with statistics
async function getYouTubeChannelDetails(req, res) {
  try {
    const account = await YouTubeAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(404).json({ success: false, message: 'No YouTube account connected' });
    }

    if (!account.channelId) {
      return res.json({
        success: true,
        title: account.channelTitle || 'YouTube Channel',
        statistics: {
          subscriberCount: '0',
          videoCount: '0',
          viewCount: '0'
        }
      });
    }

    // Try to fetch live statistics
    try {
      const oauth2Client = getOAuthClient(req.userId);
      oauth2Client.setCredentials({
        access_token: account.accessToken,
        refresh_token: account.refreshToken
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const channelResp = await youtube.channels.list({
        id: [account.channelId],
        part: ['snippet', 'statistics']
      });

      const channel = channelResp.data.items?.[0];
      if (channel) {
        return res.json({
          success: true,
          title: channel.snippet.title,
          statistics: channel.statistics || {
            subscriberCount: '0',
            videoCount: '0',
            viewCount: '0'
          }
        });
      }
    } catch (apiError) {
      console.log('YouTube API call failed, using cached data:', apiError.message);
    }

    // Fallback to cached data
    return res.json({
      success: true,
      title: account.channelTitle || 'YouTube Channel',
      statistics: {
        subscriberCount: '0',
        videoCount: '0',
        viewCount: '0'
      }
    });
  } catch (error) {
    console.error('Error getting YouTube channel details:', error);
    return res.status(400).json({ success: false, message: 'Failed to get channel details' });
  }
}

module.exports = { 
  exchangeCode, 
  getYouTubeAccount, 
  disconnectYouTube, 
  testYouTubeConnection,
  getYouTubeChannels,
  selectYouTubeChannel,
  getYouTubeChannelDetails
};












