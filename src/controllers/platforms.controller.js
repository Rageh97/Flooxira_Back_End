const { User } = require('../models/user');

async function checkConnections(req, res) {
  try {
    const userId = req.user.id;
    
    // Check actual connection status for all platforms using individual controllers
    const connections = {
      facebook: false,
      instagram: false,
      youtube: false,
      tiktok: false,
      linkedin: false,
      pinterest: false
    };
    
    // Check Facebook connection (Instagram uses the same connection)
    try {
      const { getFacebookAccount } = require('./facebook.controller');
      const facebookReq = { userId, user: { id: userId } };
      const facebookRes = { json: (data) => data, status: () => ({ json: () => ({ connected: false }) }) };
      const facebookData = await getFacebookAccount(facebookReq, facebookRes);
      connections.facebook = facebookData.connected || false;
      connections.instagram = facebookData.connected || false; // Instagram uses Facebook's token
    } catch (e) {
      console.error('Error checking Facebook connection:', e);
    }
    
    // Check LinkedIn connection
    try {
      const { getLinkedInAccount } = require('./linkedin.controller');
      const linkedinReq = { userId, user: { id: userId } };
      const linkedinRes = { json: (data) => data, status: () => ({ json: () => ({ connected: false }) }) };
      const linkedinData = await getLinkedInAccount(linkedinReq, linkedinRes);
      connections.linkedin = linkedinData.connected || false;
    } catch (e) {
      console.error('Error checking LinkedIn connection:', e);
    }
    
    // Check Pinterest connection
    try {
      const { getPinterestAccount } = require('./pinterest.controller');
      const pinterestReq = { userId, user: { id: userId } };
      const pinterestRes = { json: (data) => data, status: () => ({ json: () => ({ connected: false }) }) };
      const pinterestData = await getPinterestAccount(pinterestReq, pinterestRes);
      connections.pinterest = pinterestData.connected || false;
    } catch (e) {
      console.error('Error checking Pinterest connection:', e);
    }
    
    // Check YouTube connection
    try {
      const { getYouTubeAccount } = require('./youtube.controller');
      const youtubeReq = { userId, user: { id: userId } };
      const youtubeRes = { json: (data) => data, status: () => ({ json: () => ({ connected: false }) }) };
      const youtubeData = await getYouTubeAccount(youtubeReq, youtubeRes);
      connections.youtube = youtubeData.connected || false;
    } catch (e) {
      console.error('Error checking YouTube connection:', e);
    }
    
    // Check TikTok connection
    try {
      const { getTikTokAccount } = require('./tiktok.controller');
      const tiktokReq = { userId, user: { id: userId } };
      const tiktokRes = { json: (data) => data, status: () => ({ json: () => ({ connected: false }) }) };
      const tiktokData = await getTikTokAccount(tiktokReq, tiktokRes);
      connections.tiktok = tiktokData.connected || false;
    } catch (e) {
      console.error('Error checking TikTok connection:', e);
    }
    
    res.json({ 
      success: true, 
      connections,
      mode: process.env.NODE_ENV || 'development'
    });
  } catch (e) {
    console.error('Error checking platform connections:', e);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check platform connections',
      error: e.message 
    });
  }
}

module.exports = { checkConnections };