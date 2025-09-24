const TikTokAccount = require('../models/tiktokAccount');
const crypto = require('../utils/crypto');

// TikTok API configuration
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || 'http://localhost:4000/auth/tiktok/callback';

// Exchange TikTok OAuth code for access token
async function exchangeCode(req, res) {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: 'TikTok authorization code is required' });
    }
    
    console.log('Exchanging TikTok OAuth code for access token...');
    
    // Exchange code for access token
    const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      body: new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: TIKTOK_REDIRECT_URI
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('TikTok token exchange error:', tokenData.error);
      return res.status(400).json({ 
        message: 'Failed to exchange TikTok code for token',
        error: tokenData.error.message || tokenData.error
      });
    }
    
    console.log('TikTok access token received, getting user info...');
    
    // Get user info using the access token (v2 requires fields parameter)
    const userFields = [
      'user.open_id',
      'user.username',
      'user.display_name',
      'user.avatar_url',
      'user.follower_count',
      'user.following_count',
      'user.video_count'
    ].join(',');
    const userResponse = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(userFields)}`, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Cache-Control': 'no-cache'
      }
    });
    
    const userData = await userResponse.json();
    
    if (userData.error) {
      console.error('TikTok user info error:', userData.error);
      return res.status(400).json({ 
        message: 'Failed to get TikTok user info',
        error: userData.error.message || userData.error
      });
    }
    
    console.log('TikTok user info received:', userData);
    
    // Store or update TikTok account
    const [account, created] = await TikTokAccount.findOrCreate({
      where: { userId: req.userId },
      defaults: {
        userId: req.userId,
        tiktokUserId: userData.data.user.open_id,
        username: userData.data.user.username,
        displayName: userData.data.user.display_name,
        profilePicture: userData.data.user.avatar_url,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)),
        lastSyncAt: new Date()
      }
    });
    
    if (!created) {
      // Update existing account
      account.tiktokUserId = userData.data.user.open_id;
      account.username = userData.data.user.username;
      account.displayName = userData.data.user.display_name;
      account.profilePicture = userData.data.user.avatar_url;
      account.accessToken = tokenData.access_token;
      account.refreshToken = tokenData.refresh_token;
      account.expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
      account.lastSyncAt = new Date();
      account.isActive = true;
      await account.save();
    }
    
    console.log('TikTok account saved successfully');
    
    return res.json({
      success: true,
      message: 'TikTok account connected successfully',
      account: {
        id: account.id,
        username: account.username,
        displayName: account.displayName,
        profilePicture: account.profilePicture
      }
    });
    
  } catch (error) {
    console.error('Error exchanging TikTok code:', error);
    return res.status(500).json({ 
      message: 'Failed to complete TikTok connection',
      error: error.message 
    });
  }
}

// Get TikTok account info
async function getTikTokAccount(req, res) {
  try {
    const account = await TikTokAccount.findOne({ where: { userId: req.userId } });
    
    if (!account) {
      return res.status(404).json({ message: 'No TikTok account connected' });
    }
    
    // Check if token is expired and refresh if needed
    if (account.expiresAt && new Date() > account.expiresAt) {
      console.log('TikTok access token expired, attempting refresh...');
      
      try {
        const refreshResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache'
          },
          body: new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY,
            client_secret: TIKTOK_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: account.refreshToken
          })
        });
        
        const refreshData = await refreshResponse.json();
        
        if (refreshData.error) {
          console.error('TikTok token refresh failed:', refreshData.error);
          account.isActive = false;
          await account.save();
          
          return res.status(401).json({ 
            message: 'TikTok access token expired and refresh failed',
            error: 'Please reconnect your TikTok account'
          });
        }
        
        // Update tokens
        account.accessToken = refreshData.access_token;
        if (refreshData.refresh_token) {
          account.refreshToken = refreshData.refresh_token;
        }
        account.expiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));
        account.lastSyncAt = new Date();
        await account.save();
        
        console.log('TikTok access token refreshed successfully');
        
      } catch (refreshError) {
        console.error('Error refreshing TikTok token:', refreshError);
        account.isActive = false;
        await account.save();
        
        return res.status(401).json({ 
          message: 'Failed to refresh TikTok access token',
          error: 'Please reconnect your TikTok account'
        });
      }
    }
    
    // Get updated user stats
    try {
      const statsFields = [
        'user.follower_count',
        'user.following_count',
        'user.video_count',
        'user.username'
      ].join(',');
      const statsResponse = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(statsFields)}`, {
        headers: {
          'Authorization': `Bearer ${account.accessToken}`,
          'Cache-Control': 'no-cache'
        }
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        
        if (statsData.data && statsData.data.user) {
          account.followerCount = statsData.data.user.follower_count || 0;
          account.followingCount = statsData.data.user.following_count || 0;
          account.videoCount = statsData.data.user.video_count || 0;
          account.lastSyncAt = new Date();
          await account.save();
        }
      }
    } catch (statsError) {
      console.error('Error updating TikTok stats:', statsError);
      // Don't fail the request if stats update fails
    }
    
    return res.json({
      id: account.id,
      tiktokUserId: account.tiktokUserId,
      username: account.username,
      displayName: account.displayName,
      profilePicture: account.profilePicture,
      followerCount: account.followerCount,
      followingCount: account.followingCount,
      videoCount: account.videoCount,
      isActive: account.isActive,
      lastSyncAt: account.lastSyncAt
    });
    
  } catch (error) {
    console.error('Error getting TikTok account:', error);
    return res.status(500).json({ 
      message: 'Failed to get TikTok account',
      error: error.message 
    });
  }
}

// Disconnect TikTok account
async function disconnectTikTok(req, res) {
  try {
    const account = await TikTokAccount.findOne({ where: { userId: req.userId } });
    
    if (!account) {
      return res.status(404).json({ message: 'No TikTok account connected' });
    }
    
    await account.destroy();
    
    console.log('TikTok account disconnected successfully');
    
    return res.json({
      success: true,
      message: 'TikTok account disconnected successfully'
    });
    
  } catch (error) {
    console.error('Error disconnecting TikTok account:', error);
    return res.status(500).json({ 
      message: 'Failed to disconnect TikTok account',
      error: error.message 
    });
  }
}

// Test TikTok connection
async function testTikTokConnection(req, res) {
  try {
    const account = await TikTokAccount.findOne({ where: { userId: req.userId } });
    
    if (!account) {
      return res.status(400).json({ message: 'No TikTok account connected' });
    }
    
    // Test API connection
    const testFields = [ 'user.username' ].join(',');
    const testResponse = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(testFields)}`, {
      headers: {
        'Authorization': `Bearer ${account.accessToken}`,
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.error('TikTok API test failed:', errorText);
      return res.status(400).json({ 
        message: 'TikTok API connection failed',
        error: errorText
      });
    }
    
    const testData = await testResponse.json();
    console.log('TikTok API test successful:', testData.data?.user?.username);
    
    return res.json({
      success: true,
      message: 'TikTok connection test successful',
      username: testData.data?.user?.username
    });
    
  } catch (error) {
    console.error('Error testing TikTok connection:', error);
    return res.status(500).json({ 
      message: 'Failed to test TikTok connection',
      error: error.message 
    });
  }
}

module.exports = {
  exchangeCode,
  getTikTokAccount,
  disconnectTikTok,
  testTikTokConnection
};
