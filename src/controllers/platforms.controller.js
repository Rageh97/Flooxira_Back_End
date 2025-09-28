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
      const FacebookAccount = require('../models/facebookAccount');
      const facebookAccount = await FacebookAccount.findOne({ where: { userId } });
      connections.facebook = !!facebookAccount;
      connections.instagram = !!facebookAccount; // Instagram uses Facebook's token
    } catch (e) {
      console.error('Error checking Facebook connection:', e);
    }
    
    // Check LinkedIn connection
    try {
      const LinkedInAccount = require('../models/linkedinAccount');
      const linkedinAccount = await LinkedInAccount.findOne({ where: { userId } });
      connections.linkedin = !!linkedinAccount;
    } catch (e) {
      console.error('Error checking LinkedIn connection:', e);
    }
    
    // Check Pinterest connection
    try {
      const PinterestAccount = require('../models/pinterestAccount');
      const pinterestAccount = await PinterestAccount.findOne({ where: { userId } });
      connections.pinterest = !!pinterestAccount;
    } catch (e) {
      console.error('Error checking Pinterest connection:', e);
    }
    
    // Check YouTube connection
    try {
      const YouTubeAccount = require('../models/youtubeAccount');
      const youtubeAccount = await YouTubeAccount.findOne({ where: { userId } });
      connections.youtube = !!youtubeAccount;
    } catch (e) {
      console.error('Error checking YouTube connection:', e);
    }
    
    // Check TikTok connection
    try {
      const TikTokAccount = require('../models/tiktokAccount');
      const tiktokAccount = await TikTokAccount.findOne({ where: { userId } });
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