const { LinkedInAccount } = require('../models/linkedinAccount');
const crypto = require('../utils/crypto');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:4000/auth/linkedin/callback';

// Retry utility for LinkedIn API calls
async function fetchWithRetry(url, options, maxRetries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`LinkedIn API call attempt ${attempt}/${maxRetries}: ${url}`);
      
      const response = await fetch(url, {
        ...options,
        timeout: 30000, // 30 second timeout
        headers: {
          ...options.headers,
          'User-Agent': 'SocialManage/1.0',
          'Accept': 'application/json',
          'Connection': 'keep-alive'
        }
      });
      
      if (response.ok) {
        return response;
      }
      
      // If it's a client error (4xx), don't retry
      if (response.status >= 400 && response.status < 500) {
        throw new Error(`LinkedIn API error: ${response.status} ${response.statusText}`);
      }
      
      // For server errors (5xx) or network issues, retry
      if (attempt < maxRetries) {
        console.log(`LinkedIn API call failed (attempt ${attempt}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw new Error(`LinkedIn API failed after ${maxRetries} attempts: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      if (attempt < maxRetries) {
        console.log(`LinkedIn API call error (attempt ${attempt}): ${error.message}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      } else {
        throw error;
      }
    }
  }
}

async function exchangeCode(req, res) {
  try {
    const { code } = req.body;
    const userId = req.userId;

    if (!code) {
      return res.status(400).json({ message: 'LinkedIn authorization code is required' });
    }

    console.log('Exchanging LinkedIn OAuth code for access token...');

    // Exchange code for access token
    const tokenResponse = await fetchWithRetry('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: LINKEDIN_CLIENT_ID || '',
        client_secret: LINKEDIN_CLIENT_SECRET || '',
        redirect_uri: LINKEDIN_REDIRECT_URI,
        code
      })
    });

    const tokenText = await tokenResponse.text();
    let tokenData;
    try { 
      tokenData = tokenText ? JSON.parse(tokenText) : {}; 
    } catch { 
      tokenData = { raw: tokenText }; 
    }

    if (!tokenResponse.ok || tokenData.error) {
      console.error('LinkedIn token exchange error:', tokenData);
      return res.status(400).json({ 
        message: tokenData.error_description || 'Failed to exchange LinkedIn code', 
        error: tokenData 
      });
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || null;
    const expiresIn = tokenData.expires_in ? Number(tokenData.expires_in) : null;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
    const scope = tokenData.scope || null;

    console.log('LinkedIn token received, getting user profile...');

    // Get user profile information using OpenID Connect
    let profileData = null;
    try {
      // Try OpenID Connect userinfo endpoint first
      const userInfoResponse = await fetchWithRetry('https://api.linkedin.com/v2/userinfo', {
        headers: { 
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (userInfoResponse.ok) {
        profileData = await userInfoResponse.json();
        console.log('LinkedIn OpenID Connect user data received:', profileData.sub);
      } else {
        // Fallback to traditional profile endpoint
        const profileResponse = await fetchWithRetry('https://api.linkedin.com/v2/people/~', {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0'
          }
        });

        if (profileResponse.ok) {
          profileData = await profileResponse.json();
          console.log('LinkedIn profile data received:', profileData.id);
        } else {
          console.log('LinkedIn profile not available with current scope, using basic info');
        }
      }
    } catch (profileError) {
      console.log('Profile fetch error:', profileError.message);
    }

    // Skip email fetch to avoid 403 errors - LinkedIn requires additional scope
    let emailData = null;

    // Extract user information (handle both OpenID Connect and traditional profile)
    let linkedinUserId = null;
    let firstName = '';
    let lastName = '';
    let name = 'LinkedIn User';
    let profilePicture = null;

    if (profileData) {
      // OpenID Connect response
      if (profileData.sub) {
        linkedinUserId = profileData.sub;
        firstName = profileData.given_name || '';
        lastName = profileData.family_name || '';
        name = profileData.name || `${firstName} ${lastName}`.trim() || 'LinkedIn User';
        profilePicture = profileData.picture || null;
      }
      // Traditional profile response
      else if (profileData.id) {
        linkedinUserId = profileData.id;
        firstName = profileData.firstName?.localized?.en_US || profileData.firstName || '';
        lastName = profileData.lastName?.localized?.en_US || profileData.lastName || '';
        name = `${firstName} ${lastName}`.trim() || 'LinkedIn User';
        profilePicture = profileData.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]?.identifier || null;
      }
    }

    // If we still don't have a user ID, we can't proceed with posting
    if (!linkedinUserId) {
      console.log('No LinkedIn user ID available, cannot create account');
      return res.status(400).json({ 
        message: 'Unable to retrieve LinkedIn user information. Please ensure your LinkedIn app has the necessary permissions.' 
      });
    }

    const email = emailData?.elements?.[0]?.['handle~']?.emailAddress || null;

    // Upsert LinkedIn account
    const [account] = await LinkedInAccount.findOrCreate({
      where: { userId },
      defaults: {
        userId,
        linkedinUserId,
        name,
        email,
        profilePicture,
        accessToken: crypto.encrypt(accessToken),
        refreshToken: refreshToken ? crypto.encrypt(refreshToken) : null,
        tokenExpiresAt: expiresAt,
        scope,
        isActive: true,
        lastSyncAt: new Date()
      }
    });

    // Update existing account
    account.linkedinUserId = linkedinUserId;
    account.name = name;
    account.email = email;
    account.profilePicture = profilePicture;
    account.accessToken = crypto.encrypt(accessToken);
    account.refreshToken = refreshToken ? crypto.encrypt(refreshToken) : null;
    account.tokenExpiresAt = expiresAt;
    account.scope = scope;
    account.isActive = true;
    account.lastSyncAt = new Date();
    await account.save();

    return res.json({
      message: 'LinkedIn account connected successfully',
      account: {
        id: account.id,
        linkedinUserId: account.linkedinUserId,
        name: account.name,
        email: account.email,
        profilePicture: account.profilePicture,
        scope: account.scope
      }
    });
  } catch (err) {
    console.error('LinkedIn exchange code error:', err);
    return res.status(500).json({ 
      message: 'Internal error exchanging LinkedIn code', 
      error: String(err?.message || err) 
    });
  }
}

async function getLinkedInAccount(req, res) {
  try {
    const userId = req.userId;
    const account = await LinkedInAccount.findOne({ 
      where: { 
        userId,
        isActive: true,
        accessToken: { [require('sequelize').Op.ne]: '' } // Not empty
      } 
    });
    
    if (!account) {
      return res.json({ connected: false });
    }

    return res.json({
      connected: true,
      account: {
        id: account.id,
        linkedinUserId: account.linkedinUserId,
        name: account.name,
        email: account.email,
        profilePicture: account.profilePicture,
        scope: account.scope,
        lastSyncAt: account.lastSyncAt
      }
    });
  } catch (error) {
    console.error('Error getting LinkedIn account:', error);
    return res.status(500).json({ message: 'Failed to get LinkedIn account info' });
  }
}

async function disconnectLinkedIn(req, res) {
  try {
    const userId = req.userId;
    const account = await LinkedInAccount.findOne({ where: { userId } });
    
    if (!account) {
      return res.status(404).json({ message: 'No LinkedIn account connected' });
    }

    // Delete the account record completely
    await account.destroy();

    console.log('LinkedIn account deleted for user:', userId);
    return res.json({ message: 'LinkedIn account disconnected successfully' });
  } catch (error) {
    console.error('Error disconnecting LinkedIn account:', error);
    return res.status(500).json({ message: 'Failed to disconnect LinkedIn account' });
  }
}

async function testLinkedInConnection(req, res) {
  try {
    const userId = req.userId;
    const account = await LinkedInAccount.findOne({ where: { userId } });
    
    if (!account || !account.accessToken) {
      return res.json({ ok: false, message: 'LinkedIn not connected' });
    }

    const accessToken = crypto.decrypt(account.accessToken);
    
    console.log('Testing LinkedIn connection...');
    
    // Test basic connectivity
    const testResponse = await fetch('https://api.linkedin.com/v2/people/~', {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      },
      timeout: 10000
    });

    if (!testResponse.ok) {
      const errorText = await testResponse.text();
      console.log('LinkedIn connection test failed:', errorText);
      return res.json({ 
        ok: false, 
        message: `LinkedIn API test failed: ${errorText}` 
      });
    }

    const testData = await testResponse.json();
    console.log('LinkedIn connection test successful');
    
    return res.json({ 
      ok: true, 
      message: 'LinkedIn API reachable', 
      user: testData.localizedFirstName || account.name 
    });
  } catch (err) {
    console.error('LinkedIn connection test error:', err);
    return res.json({ 
      ok: false, 
      message: `Error testing LinkedIn: ${String(err?.message || err)}` 
    });
  }
}

// LinkedIn Posts Management
async function createLinkedInPost(req, res) {
  try {
    const userId = req.userId;
    const { text, visibility = 'PUBLIC' } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Post text is required' });
    }

    const account = await LinkedInAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) {
      return res.status(400).json({ message: 'LinkedIn not connected' });
    }

    const accessToken = crypto.decrypt(account.accessToken);

    // Get the user's LinkedIn ID for the author URN
    let personUrn = null;
    try {
      // Try OpenID Connect userinfo endpoint first
      const userInfoResponse = await fetchWithRetry('https://api.linkedin.com/v2/userinfo', {
        headers: { 
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (userInfoResponse.ok) {
        const userData = await userInfoResponse.json();
        personUrn = `urn:li:person:${userData.sub}`;
        console.log('LinkedIn OpenID Connect URN for posting:', personUrn);
      } else {
        // Fallback to traditional profile endpoint
        const profileResponse = await fetchWithRetry('https://api.linkedin.com/v2/people/~', {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0'
          }
        });

        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          personUrn = `urn:li:person:${profileData.id}`;
          console.log('LinkedIn profile URN for posting:', personUrn);
        } else {
          console.log('LinkedIn profile not available, using stored user ID');
          personUrn = `urn:li:person:${account.linkedinUserId}`;
        }
      }
    } catch (profileError) {
      console.log('Profile fetch error, using stored user ID:', profileError.message);
      personUrn = `urn:li:person:${account.linkedinUserId}`;
    }

    // Create the post
    const postData = {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: text
          },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility
      }
    };

    const postResponse = await fetchWithRetry('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(postData)
    });

    const postResult = await postResponse.json();

    if (!postResponse.ok) {
      return res.status(400).json({ 
        message: 'Failed to create LinkedIn post', 
        error: postResult 
      });
    }

    return res.json({
      ok: true,
      message: 'LinkedIn post created successfully',
      post: {
        id: postResult.id,
        text: text,
        visibility: visibility
      }
    });
  } catch (err) {
    console.error('LinkedIn post creation error:', err);
    return res.status(500).json({ 
      message: 'Error creating LinkedIn post', 
      error: String(err?.message || err) 
    });
  }
}

async function getLinkedInPosts(req, res) {
  try {
    const userId = req.userId;
    const { count = 10 } = req.query;
    
    const account = await LinkedInAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) {
      return res.status(400).json({ message: 'LinkedIn not connected' });
    }

    const accessToken = crypto.decrypt(account.accessToken);

    // Get user's profile URN
    let personUrn = null;
    try {
      // Try OpenID Connect userinfo endpoint first
      const userInfoResponse = await fetchWithRetry('https://api.linkedin.com/v2/userinfo', {
        headers: { 
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (userInfoResponse.ok) {
        const userData = await userInfoResponse.json();
        personUrn = `urn:li:person:${userData.sub}`;
        console.log('LinkedIn OpenID Connect URN for posts fetch:', personUrn);
      } else {
        // Fallback to traditional profile endpoint
        const profileResponse = await fetchWithRetry('https://api.linkedin.com/v2/people/~', {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0'
          }
        });

        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          personUrn = `urn:li:person:${profileData.id}`;
          console.log('LinkedIn profile URN for posts fetch:', personUrn);
        } else {
          console.log('LinkedIn profile not available, using stored user ID');
          personUrn = `urn:li:person:${account.linkedinUserId}`;
        }
      }
    } catch (profileError) {
      console.log('Profile fetch error, using stored user ID:', profileError.message);
      personUrn = `urn:li:person:${account.linkedinUserId}`;
    }

    // Get user's posts
    const postsResponse = await fetchWithRetry(`https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(${encodeURIComponent(personUrn)})&count=${count}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    const postsData = await postsResponse.json();

    if (!postsResponse.ok) {
      return res.status(400).json({ 
        message: 'Failed to get LinkedIn posts', 
        error: postsData 
      });
    }

    return res.json({
      ok: true,
      posts: postsData.elements || []
    });
  } catch (err) {
    console.error('LinkedIn posts fetch error:', err);
    return res.status(500).json({ 
      message: 'Error fetching LinkedIn posts', 
      error: String(err?.message || err) 
    });
  }
}

// LinkedIn Analytics
async function getLinkedInAnalytics(req, res) {
  try {
    const userId = req.userId;
    const { timeRange = '30d' } = req.query;
    
    const account = await LinkedInAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) {
      return res.status(400).json({ message: 'LinkedIn not connected' });
    }

    const accessToken = crypto.decrypt(account.accessToken);

    // Get user's profile URN
    const profileResponse = await fetch('https://api.linkedin.com/v2/people/~', {
      headers: { 
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    if (!profileResponse.ok) {
      return res.status(400).json({ message: 'Failed to get LinkedIn profile' });
    }

    const profileData = await profileResponse.json();
    const personUrn = `urn:li:person:${profileData.id}`;

    // Get analytics data (this is a simplified version - LinkedIn analytics API is complex)
    const analyticsResponse = await fetch(`https://api.linkedin.com/v2/networkSizes/edge=1?edgeType=CompanyFollowedByMember&q=viewer`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    let analyticsData = {};
    if (analyticsResponse.ok) {
      analyticsData = await analyticsResponse.json();
    }

    // Return basic analytics (LinkedIn's full analytics API requires special permissions)
    return res.json({
      ok: true,
      analytics: {
        profileViews: analyticsData.firstDegreeSize || 0,
        connections: analyticsData.secondDegreeSize || 0,
        timeRange: timeRange,
        note: 'LinkedIn analytics require special API permissions. This shows basic network data.'
      }
    });
  } catch (err) {
    console.error('LinkedIn analytics error:', err);
    return res.status(500).json({ 
      message: 'Error fetching LinkedIn analytics', 
      error: String(err?.message || err) 
    });
  }
}

// LinkedIn Company Pages (if user has access)
async function getLinkedInCompanies(req, res) {
  try {
    const userId = req.userId;
    
    const account = await LinkedInAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) {
      return res.status(400).json({ message: 'LinkedIn not connected' });
    }

    const accessToken = crypto.decrypt(account.accessToken);

    // Get user's admin companies
    const companiesResponse = await fetch('https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    if (!companiesResponse.ok) {
      return res.status(400).json({ 
        message: 'Failed to get LinkedIn companies', 
        error: await companiesResponse.text() 
      });
    }

    const companiesData = await companiesResponse.json();

    return res.json({
      ok: true,
      companies: companiesData.elements || []
    });
  } catch (err) {
    console.error('LinkedIn companies error:', err);
    return res.status(500).json({ 
      message: 'Error fetching LinkedIn companies', 
      error: String(err?.message || err) 
    });
  }
}

// Upload image to LinkedIn and create post with image
async function createLinkedInPostWithImage(req, res) {
  try {
    const userId = req.userId;
    const { text, imageUrl, visibility = 'PUBLIC' } = req.body;
    
    if (!text) {
      return res.status(400).json({ message: 'Post text is required' });
    }

    const account = await LinkedInAccount.findOne({ where: { userId } });
    if (!account || !account.accessToken) {
      return res.status(400).json({ message: 'LinkedIn not connected' });
    }

    const accessToken = crypto.decrypt(account.accessToken);

    // Get the user's LinkedIn ID for the author URN
    let personUrn = null;
    try {
      // Try OpenID Connect userinfo endpoint first
      const userInfoResponse = await fetchWithRetry('https://api.linkedin.com/v2/userinfo', {
        headers: { 
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (userInfoResponse.ok) {
        const userData = await userInfoResponse.json();
        personUrn = `urn:li:person:${userData.sub}`;
        console.log('LinkedIn OpenID Connect URN for posting:', personUrn);
      } else {
        // Fallback to traditional profile endpoint
        const profileResponse = await fetchWithRetry('https://api.linkedin.com/v2/people/~', {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0'
          }
        });

        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          personUrn = `urn:li:person:${profileData.id}`;
          console.log('LinkedIn profile URN for posting:', personUrn);
        } else {
          console.log('LinkedIn profile not available, using stored user ID');
          personUrn = `urn:li:person:${account.linkedinUserId}`;
        }
      }
    } catch (profileError) {
      console.log('Profile fetch error, using stored user ID:', profileError.message);
      personUrn = `urn:li:person:${account.linkedinUserId}`;
    }

    let postData;
    
    if (imageUrl) {
      // Upload image first
      const imageUploadResponse = await fetchWithRetry('https://api.linkedin.com/v2/assets?action=registerUpload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
            owner: personUrn,
            serviceRelationships: [{
              relationshipType: 'OWNER',
              identifier: 'urn:li:userGeneratedContent'
            }]
          }
        })
      });

      if (!imageUploadResponse.ok) {
        throw new Error('Failed to register image upload');
      }

      const uploadData = await imageUploadResponse.json();
      const asset = uploadData.value.asset;
      const uploadUrl = uploadData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;

      // Upload the actual image
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = await imageResponse.arrayBuffer();

      const uploadResponse = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/octet-stream'
        },
        body: imageBuffer
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      // Create post with image
      postData = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text
            },
            shareMediaCategory: 'IMAGE',
            media: [{
              status: 'READY',
              description: {
                text: text
              },
              media: asset
            }]
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility
        }
      };
    } else {
      // Create text-only post
      postData = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: text
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': visibility
        }
      };
    }

    const postResponse = await fetchWithRetry('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(postData)
    });

    const postResult = await postResponse.json();

    if (!postResponse.ok) {
      return res.status(400).json({ 
        message: 'Failed to create LinkedIn post', 
        error: postResult 
      });
    }

    return res.json({
      success: true,
      message: 'LinkedIn post created successfully',
      postId: postResult.id
    });
  } catch (error) {
    console.error('LinkedIn post creation error:', error);
    return res.status(500).json({ 
      message: 'Failed to create LinkedIn post', 
      error: String(error?.message || error) 
    });
  }
}

module.exports = {
  exchangeCode,
  getLinkedInAccount,
  disconnectLinkedIn,
  testLinkedInConnection,
  createLinkedInPost,
  createLinkedInPostWithImage,
  getLinkedInPosts,
  getLinkedInAnalytics,
  getLinkedInCompanies
};
