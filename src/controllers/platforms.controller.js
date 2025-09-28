const { User } = require('../models/user');
const FacebookAccount = require('../models/facebookAccount');
const LinkedInAccount = require('../models/linkedinAccount');
const PinterestAccount = require('../models/pinterestAccount');
const YouTubeAccount = require('../models/youtubeAccount');
const TikTokAccount = require('../models/tiktokAccount');

async function checkConnections(req, res) {
  try {
    const userId = req.user.id;
    
    // Check actual connection status for all platforms
    const connections = {
      facebook: false,
      instagram: false,
      youtube: false,
      tiktok: false,
      linkedin: false,
      pinterest: false
    };
    
    // Check Facebook connection
    try {
      const facebookAccount = await FacebookAccount.findOne({ where: { userId, isActive: true } });
      connections.facebook = !!facebookAccount;
      connections.instagram = !!facebookAccount; // Instagram uses Facebook's token
    } catch (e) {
      console.error('Error checking Facebook connection:', e);
    }
    
    // Check LinkedIn connection
    try {
      const linkedinAccount = await LinkedInAccount.findOne({ where: { userId, isActive: true } });
      connections.linkedin = !!linkedinAccount;
    } catch (e) {
      console.error('Error checking LinkedIn connection:', e);
    }
    
    // Check Pinterest connection
    try {
      const pinterestAccount = await PinterestAccount.findOne({ where: { userId, isActive: true } });
      connections.pinterest = !!pinterestAccount;
    } catch (e) {
      console.error('Error checking Pinterest connection:', e);
    }
    
    // Check YouTube connection
    try {
      const youtubeAccount = await YouTubeAccount.findOne({ where: { userId, isActive: true } });
      connections.youtube = !!youtubeAccount;
    } catch (e) {
      console.error('Error checking YouTube connection:', e);
    }
    
    // Check TikTok connection
    try {
      const tiktokAccount = await TikTokAccount.findOne({ where: { userId, isActive: true } });
      connections.tiktok = !!tiktokAccount;
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