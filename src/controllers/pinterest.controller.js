const { PinterestAccount } = require('../models/pinterestAccount');
const crypto = require('../utils/crypto');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

async function getPinterestAccount(req, res) {
  try {
    const account = await PinterestAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.json({ connected: false });
    }
    
    return res.json({
      connected: true,
      username: account.username,
      fullName: account.fullName,
      email: account.email,
      profileImageUrl: account.profileImageUrl,
      accountType: account.accountType,
      isActive: account.isActive
    });
  } catch (error) {
    console.error('Error getting Pinterest account:', error);
    return res.status(500).json({ message: 'Failed to get account info' });
  }
}

async function exchangeCode(req, res) {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: 'code is required' });
    }
    
    console.log('Exchanging Pinterest OAuth code:', code);
    
    // Exchange code for access token
    const tokenResponse = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: process.env.PINTEREST_REDIRECT_URI
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData.error);
      return res.status(400).json({ message: tokenData.error_description || tokenData.error });
    }
    
    console.log('Pinterest token received, getting user info...');
    
    // Get user info
    const userResponse = await fetch('https://api.pinterest.com/v5/user_account', {
      headers: { 
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const userData = await userResponse.json();
    
    if (userData.error) {
      return res.status(400).json({ message: userData.message || 'Failed to get user info' });
    }
    
    console.log('User info received:', userData.username);
    
    // Encrypt and store the token
    const encryptedToken = crypto.encrypt(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token ? crypto.encrypt(tokenData.refresh_token) : null;
    
    // Save or update Pinterest account
    const [account, created] = await PinterestAccount.findOrCreate({
      where: { userId: req.userId },
      defaults: {
        userId: req.userId,
        pinterestUserId: userData.id,
        username: userData.username,
        fullName: userData.full_name,
        email: userData.email,
        accessToken: encryptedToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        profileImageUrl: userData.profile_image,
        accountType: userData.account_type || 'personal'
      }
    });
    
    if (!created) {
      account.pinterestUserId = userData.id;
      account.username = userData.username;
      account.fullName = userData.full_name;
      account.email = userData.email;
      account.accessToken = encryptedToken;
      account.refreshToken = encryptedRefreshToken;
      account.tokenExpiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;
      account.profileImageUrl = userData.profile_image;
      account.accountType = userData.account_type || 'personal';
      account.isActive = true;
      await account.save();
    }
    
    console.log('Pinterest account saved successfully');
    
    return res.json({
      success: true,
      message: 'Pinterest account connected successfully',
      account: {
        id: account.id,
        username: account.username,
        fullName: account.fullName,
        accountType: account.accountType
      }
    });
    
  } catch (error) {
    console.error('Error exchanging code:', error);
    return res.status(500).json({ message: 'Failed to exchange code' });
  }
}

async function getBoards(req, res) {
  try {
    const account = await PinterestAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Pinterest account connected' });
    }
    
    const token = crypto.decrypt(account.accessToken);
    
    // Get user's boards
    const response = await fetch('https://api.pinterest.com/v5/boards', {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ message: data.message || 'Failed to get boards' });
    }
    
    const boards = data.items.map(board => ({
      id: board.id,
      name: board.name,
      description: board.description,
      privacy: board.privacy,
      pinCount: board.pin_count || 0,
      followerCount: board.follower_count || 0
    }));
    
    return res.json({ boards });
  } catch (error) {
    console.error('Error getting Pinterest boards:', error);
    return res.status(500).json({ message: 'Failed to get boards' });
  }
}

async function createPin(req, res) {
  try {
    const { boardId, title, description, imageUrl, linkUrl } = req.body;
    
    if (!boardId || !title || !imageUrl) {
      return res.status(400).json({ message: 'boardId, title, and imageUrl are required' });
    }
    
    const account = await PinterestAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Pinterest account connected' });
    }
    
    const token = crypto.decrypt(account.accessToken);
    
    // Create pin data
    const pinData = {
      board_id: boardId,
      title: title,
      description: description || '',
      media_source: {
        source_type: 'image_url',
        url: imageUrl
      }
    };
    
    // Add link if provided
    if (linkUrl) {
      pinData.link = linkUrl;
    }
    
    const response = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pinData)
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ message: data.message || 'Failed to create pin' });
    }
    
    return res.json({
      success: true,
      pin: {
        id: data.id,
        title: data.title,
        description: data.description,
        imageUrl: data.media?.image_url,
        link: data.link,
        boardId: data.board_id
      }
    });
  } catch (error) {
    console.error('Error creating Pinterest pin:', error);
    return res.status(500).json({ message: 'Failed to create pin' });
  }
}

async function getPins(req, res) {
  try {
    const { boardId } = req.query;
    
    const account = await PinterestAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Pinterest account connected' });
    }
    
    const token = crypto.decrypt(account.accessToken);
    
    let url = 'https://api.pinterest.com/v5/pins';
    if (boardId) {
      url = `https://api.pinterest.com/v5/boards/${boardId}/pins`;
    }
    
    const response = await fetch(url, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.error) {
      return res.status(400).json({ message: data.message || 'Failed to get pins' });
    }
    
    const pins = data.items.map(pin => ({
      id: pin.id,
      title: pin.title,
      description: pin.description,
      imageUrl: pin.media?.image_url,
      link: pin.link,
      boardId: pin.board_id,
      createdAt: pin.created_at
    }));
    
    return res.json({ pins });
  } catch (error) {
    console.error('Error getting Pinterest pins:', error);
    return res.status(500).json({ message: 'Failed to get pins' });
  }
}

async function testPinterestConnection(req, res) {
  try {
    const account = await PinterestAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      return res.status(400).json({ message: 'No Pinterest account connected' });
    }
    
    const token = crypto.decrypt(account.accessToken);
    
    // Simple test to check if token is valid
    const testResponse = await fetch('https://api.pinterest.com/v5/user_account', {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    if (!testResponse.ok) {
      return res.status(400).json({ 
        message: 'Pinterest token is invalid or expired',
        status: testResponse.status 
      });
    }
    
    const testData = await testResponse.json();
    return res.json({ 
      message: 'Pinterest connection is working',
      user: testData.username,
      userId: testData.id
    });
  } catch (error) {
    console.error('Error testing Pinterest connection:', error);
    return res.status(500).json({ 
      message: 'Failed to test Pinterest connection',
      error: error.message 
    });
  }
}

async function disconnectPinterest(req, res) {
  try {
    console.log('Disconnect request received for user:', req.userId);
    
    const account = await PinterestAccount.findOne({ where: { userId: req.userId } });
    if (!account) {
      console.log('No Pinterest account found for user:', req.userId);
      return res.status(400).json({ message: 'No Pinterest account connected' });
    }
    
    console.log('Found Pinterest account to disconnect:', account.id);
    
    // Delete the Pinterest account
    await account.destroy();
    
    console.log('Pinterest account successfully disconnected for user:', req.userId);
    
    return res.json({
      success: true,
      message: 'Pinterest account disconnected successfully'
    });
  } catch (error) {
    console.error('Error disconnecting Pinterest account:', error);
    return res.status(500).json({ 
      message: 'Failed to disconnect Pinterest account',
      error: error.message 
    });
  }
}

async function refreshToken(req, res) {
  try {
    const account = await PinterestAccount.findOne({ where: { userId: req.userId } });
    if (!account || !account.refreshToken) {
      return res.status(400).json({ message: 'No Pinterest account with refresh token found' });
    }
    
    const refreshToken = crypto.decrypt(account.refreshToken);
    
    // Refresh the access token
    const tokenResponse = await fetch('https://api.pinterest.com/v5/oauth/token', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Token refresh error:', tokenData.error);
      return res.status(400).json({ message: tokenData.error_description || tokenData.error });
    }
    
    // Update the stored tokens
    account.accessToken = crypto.encrypt(tokenData.access_token);
    if (tokenData.refresh_token) {
      account.refreshToken = crypto.encrypt(tokenData.refresh_token);
    }
    account.tokenExpiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null;
    await account.save();
    
    return res.json({
      success: true,
      message: 'Token refreshed successfully'
    });
    
  } catch (error) {
    console.error('Error refreshing token:', error);
    return res.status(500).json({ message: 'Failed to refresh token' });
  }
}

module.exports = {
  getPinterestAccount,
  exchangeCode,
  getBoards,
  createPin,
  getPins,
  testPinterestConnection,
  disconnectPinterest,
  refreshToken
};
<<<<<<< HEAD
=======

>>>>>>> 864d50c3f07f932168bc1d032b613d409e3420db
