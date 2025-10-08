const FacebookAccount = require('../models/facebookAccount');
const LinkedInAccount = require('../models/linkedinAccount');
const TwitterAccount = require('../models/twitterAccount');
const YouTubeAccount = require('../models/youtubeAccount');
const PinterestAccount = require('../models/pinterestAccount');
const crypto = require('../utils/crypto');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));

// Facebook Analytics
async function getFacebookAnalytics(req, res) {
  try {
    const userId = req.userId;
    const account = await FacebookAccount.findOne({ where: { userId } });
    
    if (!account || !account.accessToken) {
      return res.status(404).json({ message: 'No Facebook account connected' });
    }

    const token = crypto.decrypt(account.accessToken);
    const analytics = {};

    // Get page insights - Real data from user's connected Facebook page
    try {
      console.log(`[Analytics] Fetching Facebook insights for user ${userId}, page ${account.pageId}`);
      const insightsResponse = await fetch(
        `https://graph.facebook.com/v21.0/${account.pageId}/insights?metric=page_fans,page_impressions,page_engaged_users&period=day&since=${Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60}&until=${Math.floor(Date.now() / 1000)}&access_token=${token}`
      );
      
      if (insightsResponse.ok) {
        const insightsData = await insightsResponse.json();
        analytics.insights = insightsData.data || [];
        console.log(`[Analytics] Facebook insights fetched for user ${userId}:`, insightsData.data?.length || 0, 'metrics');
      } else {
        const errorData = await insightsResponse.json();
        console.log(`[Analytics] Facebook insights error for user ${userId}:`, errorData);
        analytics.insights = [];
      }
    } catch (error) {
      console.log(`[Analytics] Facebook insights error for user ${userId}:`, error.message);
      analytics.insights = [];
    }

    // Get page info
    try {
      const pageResponse = await fetch(
        `https://graph.facebook.com/v21.0/${account.pageId}?fields=name,fan_count,posts.limit(10){message,created_time,likes.summary(true),comments.summary(true),shares}&access_token=${token}`
      );
      
      if (pageResponse.ok) {
        const pageData = await pageResponse.json();
        analytics.pageInfo = {
          name: pageData.name,
          fanCount: pageData.fan_count,
          recentPosts: pageData.posts?.data || []
        };
      }
    } catch (error) {
      console.log('Facebook page info error:', error.message);
    }

    // Get Instagram insights if connected
    if (account.instagramId) {
      try {
        const instagramResponse = await fetch(
          `https://graph.facebook.com/v21.0/${account.instagramId}/insights?metric=impressions,reach,profile_views&period=day&since=${Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60}&until=${Math.floor(Date.now() / 1000)}&access_token=${token}`
        );
        
        if (instagramResponse.ok) {
          const instagramData = await instagramResponse.json();
          analytics.instagram = instagramData.data || [];
        }
      } catch (error) {
        console.log('Instagram insights error:', error.message);
      }
    }

    return res.json({
      success: true,
      platform: 'facebook',
      analytics: analytics,
      userId: userId, // Include userId to confirm it's user-specific data
      message: 'Facebook analytics fetched from connected account'
    });
  } catch (error) {
    console.error('Facebook analytics error:', error);
    return res.status(500).json({ message: 'Failed to get Facebook analytics', error: error.message });
  }
}

// LinkedIn Analytics
async function getLinkedInAnalytics(req, res) {
  try {
    const userId = req.userId;
    const account = await LinkedInAccount.findOne({ where: { userId } });
    
    if (!account || !account.accessToken) {
      return res.status(404).json({ message: 'No LinkedIn account connected' });
    }

    const token = account.accessToken; // LinkedIn tokens are not encrypted
    const analytics = {};

    // Get profile stats - Real data from user's connected LinkedIn account
    try {
      console.log(`[Analytics] Fetching LinkedIn profile for user ${userId}`);
      const profileResponse = await fetch(
        `https://api.linkedin.com/v2/people/~?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))&access_token=${token}`
      );
      
      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        analytics.profile = profileData;
        console.log(`[Analytics] LinkedIn profile fetched for user ${userId}:`, profileData.firstName, profileData.lastName);
      } else {
        const errorData = await profileResponse.json();
        console.log(`[Analytics] LinkedIn profile error for user ${userId}:`, errorData);
        analytics.profile = null;
      }
    } catch (error) {
      console.log(`[Analytics] LinkedIn profile error for user ${userId}:`, error.message);
      analytics.profile = null;
    }

    // Get network size
    try {
      const networkResponse = await fetch(
        `https://api.linkedin.com/v2/networkSizes/edge=1?edgeType=CompanyFollowedByMember&q=viewer&access_token=${token}`
      );
      
      if (networkResponse.ok) {
        const networkData = await networkResponse.json();
        analytics.network = networkData;
      }
    } catch (error) {
      console.log('LinkedIn network error:', error.message);
    }

    return res.json({
      success: true,
      platform: 'linkedin',
      analytics: analytics,
      userId: userId, // Include userId to confirm it's user-specific data
      message: 'LinkedIn analytics fetched from connected account'
    });
  } catch (error) {
    console.error('LinkedIn analytics error:', error);
    return res.status(500).json({ message: 'Failed to get LinkedIn analytics', error: error.message });
  }
}

// Twitter Analytics
async function getTwitterAnalytics(req, res) {
  try {
    const userId = req.userId;
    const account = await TwitterAccount.findOne({ where: { userId } });
    
    if (!account || !account.accessToken) {
      return res.status(404).json({ message: 'No Twitter account connected' });
    }

    const analytics = {};

    // Get user info - Real data from user's connected Twitter account
    try {
      console.log(`[Analytics] Fetching Twitter metrics for user ${userId}`);
      const userResponse = await fetch(
        `https://api.twitter.com/2/users/me?user.fields=public_metrics`,
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        analytics.userMetrics = userData.data?.public_metrics || {};
        console.log(`[Analytics] Twitter metrics fetched for user ${userId}:`, analytics.userMetrics);
      } else {
        const errorData = await userResponse.json();
        console.log(`[Analytics] Twitter metrics error for user ${userId}:`, errorData);
        analytics.userMetrics = {};
      }
    } catch (error) {
      console.log(`[Analytics] Twitter metrics error for user ${userId}:`, error.message);
      analytics.userMetrics = {};
    }

    // Get recent tweets
    try {
      const tweetsResponse = await fetch(
        `https://api.twitter.com/2/users/${account.twitterUserId}/tweets?tweet.fields=public_metrics,created_at&max_results=10`,
        {
          headers: {
            'Authorization': `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (tweetsResponse.ok) {
        const tweetsData = await tweetsResponse.json();
        analytics.recentTweets = tweetsData.data || [];
      }
    } catch (error) {
      console.log('Twitter tweets error:', error.message);
    }

    return res.json({
      success: true,
      platform: 'twitter',
      analytics: analytics,
      userId: userId, // Include userId to confirm it's user-specific data
      message: 'Twitter analytics fetched from connected account'
    });
  } catch (error) {
    console.error('Twitter analytics error:', error);
    return res.status(500).json({ message: 'Failed to get Twitter analytics', error: error.message });
  }
}

// YouTube Analytics
async function getYouTubeAnalytics(req, res) {
  try {
    const userId = req.userId;
    const account = await YouTubeAccount.findOne({ where: { userId } });
    
    if (!account || !account.accessToken) {
      return res.status(404).json({ message: 'No YouTube account connected' });
    }

    let google;
    try {
      ({ google } = require('googleapis'));
    } catch (e) {
      return res.status(500).json({ message: 'Google APIs not available' });
    }

    const { getClientCredentials } = require('../services/credentialsService');
    const { clientId, clientSecret, redirectUri } = await getClientCredentials(userId, 'youtube');
    const oauth2Client = new google.auth.OAuth2(
      clientId || process.env.GOOGLE_CLIENT_ID,
      clientSecret || process.env.GOOGLE_CLIENT_SECRET,
      redirectUri || process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/youtube/callback`
    );
    
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken
    });
    
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    const analytics = {};

    // Get channel analytics - Real data from user's connected YouTube channel
    try {
      console.log(`[Analytics] Fetching YouTube channel analytics for user ${userId}`);
      const channelsResponse = await youtube.channels.list({
        mine: true,
        part: ['statistics', 'snippet']
      });
      
      if (channelsResponse.data.items && channelsResponse.data.items.length > 0) {
        const channel = channelsResponse.data.items[0];
        analytics.channel = {
          title: channel.snippet.title,
          statistics: channel.statistics
        };
        console.log(`[Analytics] YouTube channel analytics fetched for user ${userId}:`, channel.snippet.title, analytics.channel.statistics);
      } else {
        console.log(`[Analytics] No YouTube channels found for user ${userId}`);
        analytics.channel = null;
      }
    } catch (error) {
      console.log(`[Analytics] YouTube channel analytics error for user ${userId}:`, error.message);
      analytics.channel = null;
    }

    // Get recent videos
    try {
      const videosResponse = await youtube.search.list({
        part: ['snippet'],
        forMine: true,
        type: ['video'],
        maxResults: 10,
        order: 'date'
      });
      
      if (videosResponse.data.items) {
        analytics.recentVideos = videosResponse.data.items;
      }
    } catch (error) {
      console.log('YouTube videos error:', error.message);
    }

    return res.json({
      success: true,
      platform: 'youtube',
      analytics: analytics,
      userId: userId, // Include userId to confirm it's user-specific data
      message: 'YouTube analytics fetched from connected account'
    });
  } catch (error) {
    console.error('YouTube analytics error:', error);
    return res.status(500).json({ message: 'Failed to get YouTube analytics', error: error.message });
  }
}

// Pinterest Analytics
async function getPinterestAnalytics(req, res) {
  try {
    const userId = req.userId;
    const account = await PinterestAccount.findOne({ where: { userId } });
    
    if (!account || !account.accessToken) {
      return res.status(404).json({ message: 'No Pinterest account connected' });
    }

    const token = account.accessToken; // Pinterest tokens are not encrypted
    const analytics = {};

    // Get user info - Real data from user's connected Pinterest account
    try {
      console.log(`[Analytics] Fetching Pinterest user info for user ${userId}`);
      const userResponse = await fetch(
        `https://api.pinterest.com/v5/user_account?access_token=${token}`
      );
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        analytics.user = userData;
        console.log(`[Analytics] Pinterest user info fetched for user ${userId}:`, userData.username);
      } else {
        const errorData = await userResponse.json();
        console.log(`[Analytics] Pinterest user info error for user ${userId}:`, errorData);
        analytics.user = null;
      }
    } catch (error) {
      console.log(`[Analytics] Pinterest user info error for user ${userId}:`, error.message);
      analytics.user = null;
    }

    // Get boards
    try {
      const boardsResponse = await fetch(
        `https://api.pinterest.com/v5/boards?access_token=${token}`
      );
      
      if (boardsResponse.ok) {
        const boardsData = await boardsResponse.json();
        analytics.boards = boardsData.items || [];
      }
    } catch (error) {
      console.log('Pinterest boards error:', error.message);
    }

    return res.json({
      success: true,
      platform: 'pinterest',
      analytics: analytics,
      userId: userId, // Include userId to confirm it's user-specific data
      message: 'Pinterest analytics fetched from connected account'
    });
  } catch (error) {
    console.error('Pinterest analytics error:', error);
    return res.status(500).json({ message: 'Failed to get Pinterest analytics', error: error.message });
  }
}

// Get all analytics
async function getAllAnalytics(req, res) {
  try {
    const userId = req.userId;
    const analytics = {};

    // Get Facebook analytics - Real data from user's connected Facebook account
    try {
      const facebookAccount = await FacebookAccount.findOne({ where: { userId } });
      if (facebookAccount && facebookAccount.accessToken) {
        console.log(`[Analytics] Fetching Facebook analytics for user ${userId}, page ${facebookAccount.pageId}`);
        const token = crypto.decrypt(facebookAccount.accessToken);
        
        // Get page insights
        const insightsResponse = await fetch(
          `https://graph.facebook.com/v21.0/${facebookAccount.pageId}/insights?metric=page_fans,page_impressions,page_engaged_users&period=day&since=${Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60}&until=${Math.floor(Date.now() / 1000)}&access_token=${token}`
        );
        
        if (insightsResponse.ok) {
          const insightsData = await insightsResponse.json();
          analytics.facebook = {
            insights: insightsData.data || [],
            pageId: facebookAccount.pageId,
            hasInstagram: !!facebookAccount.instagramId
          };
          console.log(`[Analytics] Facebook analytics fetched for user ${userId}:`, insightsData.data?.length || 0, 'metrics');
        } else {
          console.log(`[Analytics] Facebook analytics error for user ${userId}:`, await insightsResponse.json());
        }
      } else {
        console.log(`[Analytics] No Facebook account found for user ${userId}`);
      }
    } catch (error) {
      console.log(`[Analytics] Facebook analytics error for user ${userId}:`, error.message);
    }

    // Get LinkedIn analytics - Real data from user's connected LinkedIn account
    try {
      const linkedinAccount = await LinkedInAccount.findOne({ where: { userId } });
      if (linkedinAccount && linkedinAccount.accessToken) {
        console.log(`[Analytics] Fetching LinkedIn analytics for user ${userId}`);
        const token = linkedinAccount.accessToken; // LinkedIn tokens are not encrypted
        
        const networkResponse = await fetch(
          `https://api.linkedin.com/v2/networkSizes/edge=1?edgeType=CompanyFollowedByMember&q=viewer&access_token=${token}`
        );
        
        if (networkResponse.ok) {
          const networkData = await networkResponse.json();
          analytics.linkedin = {
            network: networkData,
            name: linkedinAccount.name
          };
          console.log(`[Analytics] LinkedIn analytics fetched for user ${userId}:`, networkData);
        } else {
          console.log(`[Analytics] LinkedIn analytics error for user ${userId}:`, await networkResponse.json());
        }
      } else {
        console.log(`[Analytics] No LinkedIn account found for user ${userId}`);
      }
    } catch (error) {
      console.log(`[Analytics] LinkedIn analytics error for user ${userId}:`, error.message);
    }

    // Get Twitter analytics - Real data from user's connected Twitter account
    try {
      const twitterAccount = await TwitterAccount.findOne({ where: { userId } });
      if (twitterAccount && twitterAccount.accessToken) {
        console.log(`[Analytics] Fetching Twitter analytics for user ${userId}`);
        const userResponse = await fetch(
          `https://api.twitter.com/2/users/me?user.fields=public_metrics`,
          {
            headers: {
              'Authorization': `Bearer ${twitterAccount.accessToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          analytics.twitter = {
            metrics: userData.data?.public_metrics || {},
            username: twitterAccount.username
          };
          console.log(`[Analytics] Twitter analytics fetched for user ${userId}:`, analytics.twitter.metrics);
        } else {
          console.log(`[Analytics] Twitter analytics error for user ${userId}:`, await userResponse.json());
        }
      } else {
        console.log(`[Analytics] No Twitter account found for user ${userId}`);
      }
    } catch (error) {
      console.log(`[Analytics] Twitter analytics error for user ${userId}:`, error.message);
    }

    // Get YouTube analytics - Real data from user's connected YouTube account
    try {
      const youtubeAccount = await YouTubeAccount.findOne({ where: { userId } });
      if (youtubeAccount && youtubeAccount.accessToken) {
        console.log(`[Analytics] Fetching YouTube analytics for user ${userId}`);
        let google;
        try {
          ({ google } = require('googleapis'));
        } catch (e) {
          console.log(`[Analytics] Google APIs not available for user ${userId}`);
        }

        if (google) {
          const { getClientCredentials } = require('../services/credentialsService');
          const { clientId, clientSecret, redirectUri } = await getClientCredentials(userId, 'youtube');
          const oauth2Client = new google.auth.OAuth2(
            clientId || process.env.GOOGLE_CLIENT_ID,
            clientSecret || process.env.GOOGLE_CLIENT_SECRET,
            redirectUri || process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/youtube/callback`
          );
          
          oauth2Client.setCredentials({
            access_token: youtubeAccount.accessToken,
            refresh_token: youtubeAccount.refreshToken
          });
          
          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
          
          const channelsResponse = await youtube.channels.list({
            mine: true,
            part: ['statistics', 'snippet']
          });
          
          if (channelsResponse.data.items && channelsResponse.data.items.length > 0) {
            const channel = channelsResponse.data.items[0];
            analytics.youtube = {
              title: channel.snippet.title,
              statistics: channel.statistics
            };
            console.log(`[Analytics] YouTube analytics fetched for user ${userId}:`, channel.snippet.title, channel.statistics);
          } else {
            console.log(`[Analytics] No YouTube channels found for user ${userId}`);
          }
        }
      } else {
        console.log(`[Analytics] No YouTube account found for user ${userId}`);
      }
    } catch (error) {
      console.log(`[Analytics] YouTube analytics error for user ${userId}:`, error.message);
    }

    // Get Pinterest analytics - Real data from user's connected Pinterest account
    try {
      const pinterestAccount = await PinterestAccount.findOne({ where: { userId } });
      if (pinterestAccount && pinterestAccount.accessToken) {
        console.log(`[Analytics] Fetching Pinterest analytics for user ${userId}`);
        const token = pinterestAccount.accessToken; // Pinterest tokens are not encrypted
        
        const userResponse = await fetch(
          `https://api.pinterest.com/v5/user_account?access_token=${token}`
        );
        
        if (userResponse.ok) {
          const userData = await userResponse.json();
          analytics.pinterest = {
            user: userData,
            username: pinterestAccount.username
          };
          console.log(`[Analytics] Pinterest analytics fetched for user ${userId}:`, userData.username);
        } else {
          console.log(`[Analytics] Pinterest analytics error for user ${userId}:`, await userResponse.json());
        }
      } else {
        console.log(`[Analytics] No Pinterest account found for user ${userId}`);
      }
    } catch (error) {
      console.log(`[Analytics] Pinterest analytics error for user ${userId}:`, error.message);
    }

    // Log analytics summary for debugging
    console.log(`[Analytics] Analytics summary for user ${userId}:`, {
      facebook: !!analytics.facebook,
      linkedin: !!analytics.linkedin,
      twitter: !!analytics.twitter,
      youtube: !!analytics.youtube,
      pinterest: !!analytics.pinterest
    });

    return res.json({
      success: true,
      analytics: analytics,
      timestamp: new Date().toISOString(),
      userId: userId, // Include userId to confirm it's user-specific data
      message: 'Analytics data fetched from connected social media accounts'
    });
  } catch (error) {
    console.error('All analytics error:', error);
    return res.status(500).json({ message: 'Failed to get analytics', error: error.message });
  }
}

module.exports = {
  getFacebookAnalytics,
  getLinkedInAnalytics,
  getTwitterAnalytics,
  getYouTubeAnalytics,
  getPinterestAnalytics,
  getAllAnalytics
};
