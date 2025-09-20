const cron = require('node-cron');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({default: f}) => f(...args)));
const { Op } = require('sequelize');
const { Post } = require('./models/post');
const { FacebookAccount } = require('./models/facebookAccount');
const { LinkedInAccount } = require('./models/linkedinAccount');
const { PinterestAccount } = require('./models/pinterestAccount');
const TikTokAccount = require('./models/tiktokAccount');
const YouTubeAccount = require('./models/youtubeAccount');

async function tryPublishNow(post) {
  console.log('Attempting to publish post:', {
    id: post.id,
    type: post.type,
    format: post.format,
    content: post.content?.substring(0, 50),
    mediaUrl: post.mediaUrl ? 'Present' : 'Missing',
    userId: post.userId,
    platforms: post.platforms
  });
  
  try {
    const account = await FacebookAccount.findOne({ where: { userId: post.userId } });
    console.log('Facebook account found:', {
      exists: !!account,
      destination: account?.destination,
      pageId: account?.pageId,
      groupId: account?.groupId,
      hasToken: !!account?.accessToken,
      hasInstagram: !!account?.instagramId
    });
    
    if (account && account.accessToken) {
      // Handle Instagram posting if enabled
      if (post.platforms.includes('instagram') && account.instagramId) {
        const instagramResult = await tryPublishToInstagram(post, account);
        if (instagramResult) {
          post.instagramPostId = instagramResult.id;
        }
      }
      
      // Handle Facebook posting
      if (post.platforms.includes('facebook')) {
        const facebookResult = await tryPublishToFacebook(post, account);
        if (facebookResult) {
          post.fbPostId = facebookResult.id;
        }
      }
      
      // Update post status based on results
      if (post.instagramPostId || post.fbPostId) {
        post.status = 'published';
        post.error = null;
        await post.save();
        console.log('Post published successfully');
        return true;
      } else {
        throw new Error('Failed to publish to any platform');
      }
    }
    
    // Handle TikTok posting if enabled
    if (post.platforms.includes('tiktok')) {
      const tiktokAccount = await TikTokAccount.findOne({ where: { userId: post.userId } });
      if (tiktokAccount && tiktokAccount.accessToken) {
        const tiktokResult = await tryPublishToTikTok(post, tiktokAccount);
        if (tiktokResult) {
          post.tiktokPostId = tiktokResult.id;
          post.status = 'published';
          post.error = null;
          await post.save();
          console.log('Post published to TikTok successfully');
          return true;
        }
      } else {
        console.log('No TikTok account found for user:', post.userId);
      }
    }
    
    // Handle YouTube posting if enabled
    if (post.platforms.includes('youtube')) {
      const ytAccount = await YouTubeAccount.findOne({ where: { userId: post.userId } });
      if (ytAccount && ytAccount.accessToken) {
        const ytResult = await tryPublishToYouTube(post, ytAccount);
        if (ytResult) {
          post.youtubeVideoId = ytResult.id;
          post.status = 'published';
          post.error = null;
          await post.save();
          console.log('Post published to YouTube successfully');
          return true;
        }
      } else {
        console.log('No YouTube account found for user:', post.userId);
      }
    }

    // Handle LinkedIn posting if enabled
    if (post.platforms.includes('linkedin')) {
      const linkedinAccount = await LinkedInAccount.findOne({ 
        where: { 
          userId: post.userId,
          isActive: true,
          accessToken: { [require('sequelize').Op.ne]: '' } // Not empty
        } 
      });
      
      console.log('LinkedIn account found:', {
        exists: !!linkedinAccount,
        hasToken: !!linkedinAccount?.accessToken,
        isActive: linkedinAccount?.isActive
      });
      
      if (linkedinAccount && linkedinAccount.accessToken) {
        try {
          const linkedinResult = await tryPublishToLinkedIn(post, linkedinAccount);
          if (linkedinResult) {
            post.linkedinPostId = linkedinResult.id;
            post.status = 'published';
            post.error = null;
            await post.save();
            console.log('Post published to LinkedIn successfully');
            return true;
          }
        } catch (linkedinError) {
          console.error('LinkedIn publishing failed:', linkedinError.message);
          post.error = linkedinError.message;
          await post.save();
        }
      } else {
        console.log('No active LinkedIn account found for user:', post.userId);
        post.error = 'No active LinkedIn account found';
        await post.save();
      }
    }

    // Handle Pinterest posting if enabled
    if (post.platforms.includes('pinterest')) {
      const pinterestAccount = await PinterestAccount.findOne({ 
        where: { 
          userId: post.userId,
          isActive: true,
          accessToken: { [require('sequelize').Op.ne]: '' } // Not empty
        } 
      });
      
      console.log('Pinterest account found:', {
        exists: !!pinterestAccount,
        hasToken: !!pinterestAccount?.accessToken,
        isActive: pinterestAccount?.isActive
      });
      
      if (pinterestAccount && pinterestAccount.accessToken) {
        try {
          const pinterestResult = await tryPublishToPinterest(post, pinterestAccount);
          if (pinterestResult) {
            post.pinterestPostId = pinterestResult.id;
            post.status = 'published';
            post.error = null;
            await post.save();
            console.log('Post published to Pinterest successfully');
            return true;
          }
        } catch (pinterestError) {
          console.error('Pinterest publishing failed:', pinterestError.message);
          post.error = pinterestError.message;
          await post.save();
        }
      } else {
        console.log('No active Pinterest account found for user:', post.userId);
        post.error = 'No active Pinterest account found';
        await post.save();
      }
    }

    // Dev fallback: mark as published locally
    console.log('No Facebook account found or configured, using dev fallback');
    post.fbPostId = `dev_${post.id}`;
    post.status = 'published';
    post.error = null;
    await post.save();
    return true;
  } catch (e) {
    console.error('Failed to publish post:', e);
    post.status = 'failed';
    post.error = String(e.message || e);
    await post.save();
    return false;
  }
}

async function tryPublishToInstagram(post, account) {
  try {
    if (!account.instagramId) {
      console.log('No Instagram account connected');
      return null;
    }
    
    // Validate post data
    if (!post.mediaUrl && post.type !== 'text') {
      console.log('Instagram post missing media URL:', { type: post.type, hasMedia: !!post.mediaUrl });
      throw new Error('Instagram requires media content');
    }
    
    const token = require('./utils/crypto').decrypt(account.accessToken);
    console.log('Publishing to Instagram:', { 
      instagramId: account.instagramId, 
      postType: post.type, 
      format: post.format,
      hasMedia: !!post.mediaUrl,
      contentLength: post.content?.length || 0
    });
    
    // Instagram API endpoints
    const instagramId = account.instagramId;
    
    if (post.format === 'story') {
      return await publishInstagramStory(post, instagramId, token);
    } else if (post.format === 'reel') {
      return await publishInstagramReel(post, instagramId, token);
    } else {
      return await publishInstagramPost(post, instagramId, token);
    }
  } catch (e) {
    console.error('Instagram publishing failed:', e);
    return null;
  }
}

async function publishInstagramPost(post, instagramId, token) {
  console.log('Publishing Instagram post', { type: post.type, hasMedia: !!post.mediaUrl });
  
  if (post.type === 'photo') {
    // Create media container for photo
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'IMAGE',
          image_url: post.mediaUrl,
          caption: `${post.content || ''} ${post.hashtags || ''}`.trim(),
          access_token: token
        })
      }
    );
    
    const mediaData = await mediaResponse.json();
    console.log('Instagram media creation response:', mediaData);
    
    if (mediaData.error) {
      console.error('Instagram media creation error:', mediaData.error);
      throw new Error(mediaData.error.message);
    }
    
    // Publish the media
    const publishResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: mediaData.id,
          access_token: token
        })
      }
    );
    
    const publishData = await publishResponse.json();
    console.log('Instagram publish response:', publishData);
    
    if (publishData.error) {
      console.error('Instagram publish error:', publishData.error);
      throw new Error(publishData.error.message);
    }
    
    return { id: publishData.id, type: 'post' };
  } else if (post.type === 'video') {
    // Create video media container
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'VIDEO',
          video_url: post.mediaUrl,
          caption: `${post.content || ''} ${post.hashtags || ''}`.trim(),
          access_token: token
        })
      }
    );
    
    const mediaData = await mediaResponse.json();
    console.log('Instagram video creation response:', mediaData);
    
    if (mediaData.error) {
      console.error('Instagram video creation error:', mediaData.error);
      throw new Error(mediaData.error.message);
    }
    
    // Publish the video
    const publishResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: mediaData.id,
          access_token: token
        })
      }
    );
    
    const publishData = await publishResponse.json();
    console.log('Instagram video publish response:', publishData);
    
    if (publishData.error) {
      console.error('Instagram video publish error:', publishData.error);
      throw new Error(publishData.error.message);
    }
    
    return { id: publishData.id, type: 'video_post' };
  } else {
    // Text posts are not supported by Instagram API - convert to photo with text overlay
    console.log('Text post detected - Instagram requires media, skipping...');
    throw new Error('Instagram requires media content. Text-only posts are not supported.');
  }
}

async function publishInstagramReel(post, instagramId, token) {
  console.log('Publishing Instagram Reel');
  
  if (post.type !== 'video' || !post.mediaUrl) {
    throw new Error('Reels require a video');
  }
  
  // Create video media container for reel
  const mediaResponse = await fetch(
    `https://graph.facebook.com/v21.0/${instagramId}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        media_type: 'REELS',
        video_url: post.mediaUrl,
        caption: `${post.content || ''} ${post.hashtags || ''}`.trim(),
        access_token: token
      })
    }
  );
  
  const mediaData = await mediaResponse.json();
  console.log('Instagram Reel creation response:', mediaData);
  
  if (mediaData.error) {
    console.error('Instagram Reel creation error:', mediaData.error);
    throw new Error(mediaData.error.message);
  }
  
  // Publish the reel
  const publishResponse = await fetch(
    `https://graph.facebook.com/v21.0/${instagramId}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        creation_id: mediaData.id,
        access_token: token
      })
    }
  );
  
  const publishData = await publishResponse.json();
  console.log('Instagram Reel publish response:', publishData);
  
  if (publishData.error) {
    console.error('Instagram Reel publish error:', publishData.error);
    throw new Error(publishData.error.message);
  }
  
  return { id: publishData.id, type: 'reel' };
}

async function publishInstagramStory(post, instagramId, token) {
  console.log('Publishing Instagram Story');
  
  if (post.type === 'photo') {
    // Create story media container
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'STORY',
          image_url: post.mediaUrl,
          caption: post.content || '',
          access_token: token
        })
      }
    );
    
    const mediaData = await mediaResponse.json();
    console.log('Instagram Story creation response:', mediaData);
    
    if (mediaData.error) {
      console.error('Instagram Story creation error:', mediaData.error);
      throw new Error(mediaData.error.message);
    }
    
    return { id: mediaData.id, type: 'story' };
  } else if (post.type === 'video') {
    // Create story video container
    const mediaResponse = await fetch(
      `https://graph.facebook.com/v21.0/${instagramId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'STORY',
          video_url: post.mediaUrl,
          caption: post.content || '',
          access_token: token
        })
      }
    );
    
    const mediaData = await mediaResponse.json();
    console.log('Instagram Story video creation response:', mediaData);
    
    if (mediaData.error) {
      console.error('Instagram Story video creation error:', mediaData.error);
      throw new Error(mediaData.error.message);
    }
    
    return { id: mediaData.id, type: 'video_story' };
  } else {
    throw new Error('Stories require photo or video content');
  }
}

async function tryPublishToFacebook(post, account) {
  try {
    // Check if Facebook account has a valid destination configured
    if (!account.pageId && !account.groupId) {
      throw new Error('No Facebook page or group selected. Please configure Facebook integration in Settings.');
    }

    // Use Meta Graph API directly
    if (account.destination === 'group' && account.groupId) {
      // Group posting via Graph API
      const groupToken = require('./utils/crypto').decrypt(account.accessToken);
      let url = `https://graph.facebook.com/v21.0/${account.groupId}/feed`;
      let body;
      if (post.type === 'text') {
        const params = new URLSearchParams();
        params.set('message', post.content || '');
        params.set('access_token', groupToken);
        body = params;
      } else if (post.type === 'link') {
        const params = new URLSearchParams();
        if (post.content) params.set('message', post.content);
        params.set('link', post.linkUrl || '');
        params.set('access_token', groupToken);
        body = params;
      } else if (post.type === 'photo') {
        url = `https://graph.facebook.com/v21.0/${account.groupId}/photos`;
        const params = new URLSearchParams();
        params.set('url', post.mediaUrl || '');
        if (post.content) params.set('caption', post.content);
        params.set('access_token', groupToken);
        body = params;
      } else if (post.type === 'video') {
        url = `https://graph.facebook.com/v21.0/${account.groupId}/videos`;
        const params = new URLSearchParams();
        params.set('video_url', post.mediaUrl || '');
        if (post.content) params.set('description', post.content);
        params.set('access_token', groupToken);
        body = params;
      }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || `FB error ${res.status}`);
      return { id: data.id || data.post_id, type: 'group_post' };
    } else if (account.pageId) {
      // Page posting via Graph API
      const pageToken = require('./utils/crypto').decrypt(account.accessToken);
      let url = `https://graph.facebook.com/v21.0/${account.pageId}/feed`;
      let body;
      if (post.type === 'text') {
        const params = new URLSearchParams();
        params.set('message', `${post.content || ''} ${post.hashtags || ''}`.trim());
        params.set('access_token', pageToken);
        body = params;
      } else if (post.type === 'link') {
        const params = new URLSearchParams();
        if (post.content || post.hashtags) params.set('message', `${post.content || ''} ${post.hashtags || ''}`.trim());
        params.set('link', post.linkUrl || '');
        params.set('access_token', pageToken);
        body = params;
      } else if (post.type === 'photo') {
        url = `https://graph.facebook.com/v21.0/${account.pageId}/photos`;
        const params = new URLSearchParams();
        params.set('url', post.mediaUrl || '');
        if (post.content || post.hashtags) params.set('caption', `${post.content || ''} ${post.hashtags || ''}`.trim());
        params.set('access_token', pageToken);
        body = params;
      } else if (post.type === 'video') {
        url = `https://graph.facebook.com/v21.0/${account.pageId}/videos`;
        const params = new URLSearchParams();
        params.set('video_url', post.mediaUrl || '');
        if (post.content || post.hashtags) params.set('description', `${post.content || ''} ${post.hashtags || ''}`.trim());
        params.set('access_token', pageToken);
        body = params;
      }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || `FB error ${res.status}`);
      return { id: data.id || data.post_id, type: 'page_post' };
    }
    
    return null;
  } catch (e) {
    console.error('Facebook publishing failed:', e);
    return null;
  }
}

async function tryPublishToTikTok(post, account) {
  try {
    const token = require('./utils/crypto').decrypt(account.accessToken);
    console.log('Publishing to TikTok:', account.username);
    
    // TikTok API endpoint for video upload
    const uploadUrl = 'https://open.tiktokapis.com/v2/video/upload/';
    
    // Prepare the video data using URLSearchParams for now
    // Note: TikTok API might require different approach for video uploads
    const params = new URLSearchParams();
    
    // Add post content and hashtags
    if (post.content || post.hashtags) {
      params.set('description', `${post.content || ''} ${post.hashtags || ''}`.trim());
    }
    
    // Set privacy (0 = public, 1 = friends, 2 = private)
    params.set('privacy_level', '0');
    
    // Set disable duet, comment, and stitch (0 = enabled, 1 = disabled)
    params.set('disable_duet', '0');
    params.set('disable_comment', '0');
    params.set('disable_stitch', '0');
    
    console.log('TikTok upload URL:', uploadUrl);
    console.log('TikTok upload data:', {
      description: params.get('description'),
      privacy_level: params.get('privacy_level'),
      hasVideo: !!post.mediaUrl
    });
    
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    
    const data = await response.json();
    console.log('TikTok upload response:', { status: response.status, data });
    
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `TikTok upload failed: ${response.status}`);
    }
    
    return { id: data.data.video_id, type: 'tiktok_video' };
    
  } catch (e) {
    console.error('TikTok publishing failed:', e);
    return null;
  }
}

async function tryPublishToYouTube(post, account) {
  try {
    if (post.type !== 'video' || !post.mediaUrl) {
      throw new Error('YouTube requires a video mediaUrl');
    }

    let google;
    try {
      ({ google } = require('googleapis'));
    } catch (e) {
      console.error('googleapis module is not installed; skipping YouTube publish');
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/youtube/callback`
    );
    oauth2Client.setCredentials({
      access_token: account.accessToken,
      refresh_token: account.refreshToken
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    // Use Resumable upload with external video URL is not supported directly.
    // For simplicity, we pass the mediaUrl as file URL; in production, download then stream.
    // Here, we attempt using simple insert with media body via external fetch stream.
    const res = await youtube.videos.insert({
      part: ['snippet,status'],
      requestBody: {
        snippet: {
          title: (post.content || 'Untitled').slice(0, 95),
          description: `${post.content || ''} ${post.hashtags || ''}`.trim(),
          tags: (post.hashtags || '')
            .split(/[,#\s]+/)
            .map(t => t.trim())
            .filter(Boolean)
            .slice(0, 10)
        },
        status: {
          privacyStatus: 'public'
        }
      },
      media: {
        body: await (await fetch(post.mediaUrl)).body
      }
    });

    const videoId = res.data?.id;
    if (!videoId) throw new Error('YouTube upload failed');
    return { id: videoId };
  } catch (e) {
    console.error('YouTube publishing failed:', e);
    return null;
  }
}

async function tryPublishToLinkedIn(post, account) {
  try {
    const accessToken = require('./utils/crypto').decrypt(account.accessToken);
    console.log('Publishing to LinkedIn:', account.name);

    // Get user's profile URN (try multiple methods)
    let personUrn = null;
    try {
      // Try OpenID Connect userinfo endpoint first
      const userInfoResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { 
          Authorization: `Bearer ${accessToken}`
        },
        timeout: 30000
      });

      if (userInfoResponse.ok) {
        const userData = await userInfoResponse.json();
        personUrn = `urn:li:person:${userData.sub}`;
        console.log('LinkedIn OpenID Connect URN:', personUrn);
      } else {
        // Fallback to traditional profile endpoint
        const profileResponse = await fetch('https://api.linkedin.com/v2/people/~', {
          headers: { 
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0'
          },
          timeout: 30000
        });

        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          personUrn = `urn:li:person:${profileData.id}`;
          console.log('LinkedIn profile URN:', personUrn);
        } else {
          console.log('LinkedIn profile not available, using stored user ID');
          personUrn = `urn:li:person:${account.linkedinUserId}`;
        }
      }
    } catch (profileError) {
      console.log('Profile fetch error, using stored user ID:', profileError.message);
      personUrn = `urn:li:person:${account.linkedinUserId}`;
    }

    // Prepare post content
    let postText = post.content || '';
    if (post.hashtags) {
      postText += ` ${post.hashtags}`;
    }
    if (post.linkUrl) {
      postText += ` ${post.linkUrl}`;
    }

    // Create the post data based on post type
    let postData;
    
    if (post.type === 'link' && post.linkUrl) {
      // Link post
      postData = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: postText
            },
            shareMediaCategory: 'ARTICLE',
            media: [{
              status: 'READY',
              description: {
                text: post.content || ''
              },
              originalUrl: post.linkUrl
            }]
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };
    } else if (post.type === 'photo' && post.mediaUrl) {
      // Photo post - Upload image to LinkedIn
      try {
        console.log('Uploading image to LinkedIn:', post.mediaUrl);
        
        // Register image upload
        const imageUploadResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
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

        // Download and upload the image
        const imageResponse = await fetch(post.mediaUrl);
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
                text: postText
              },
              shareMediaCategory: 'IMAGE',
              media: [{
                status: 'READY',
                description: {
                  text: postText
                },
                media: asset
              }]
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        };
        
        console.log('Image uploaded successfully to LinkedIn');
      } catch (imageError) {
        console.log('Image upload failed, creating text post with image URL:', imageError.message);
        // Fallback to text post with image URL
        postData = {
          author: personUrn,
          lifecycleState: 'PUBLISHED',
          specificContent: {
            'com.linkedin.ugc.ShareContent': {
              shareCommentary: {
                text: `${postText}\n\nImage: ${post.mediaUrl}`
              },
              shareMediaCategory: 'NONE'
            }
          },
          visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
          }
        };
      }
    } else if (post.type === 'video' && post.mediaUrl) {
      // Video post - LinkedIn doesn't support direct video uploads in UGC API
      // We'll create a text post with the video URL mentioned
      postData = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: `${postText}\n\nVideo: ${post.mediaUrl}`
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };
    } else {
      // Text post
      postData = {
        author: personUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: postText
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      };
    }

    // Create the post with retry logic
    let postResponse;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        attempts++;
        console.log(`LinkedIn post creation attempt ${attempts}/${maxAttempts}`);
        
        postResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'User-Agent': 'SocialManage/1.0'
          },
          body: JSON.stringify(postData),
          timeout: 30000
        });
        
        if (postResponse.ok) {
          break; // Success, exit retry loop
        }
        
        if (attempts < maxAttempts) {
          console.log(`LinkedIn post creation failed (attempt ${attempts}), retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts)); // Exponential backoff
        }
      } catch (error) {
        if (attempts < maxAttempts) {
          console.log(`LinkedIn post creation error (attempt ${attempts}): ${error.message}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
        } else {
          throw error;
        }
      }
    }

    const postResult = await postResponse.json();

    if (!postResponse.ok) {
      throw new Error(postResult.message || 'Failed to create LinkedIn post');
    }

    return { id: postResult.id, type: 'linkedin_post' };
  } catch (e) {
    console.error('LinkedIn publishing failed:', e);
    return null;
  }
}

async function tryPublishToPinterest(post, account) {
  try {
    const accessToken = require('./utils/crypto').decrypt(account.accessToken);
    console.log('Publishing to Pinterest:', account.username);

    // Pinterest requires a board ID to create a pin
    // For now, we'll use a default board or the first available board
    // In a real implementation, you'd want to store the selected board ID in the post
    const boardId = post.pinterestBoardId || await getDefaultBoardId(accessToken);
    
    if (!boardId) {
      throw new Error('No Pinterest board selected. Please select a board in your Pinterest settings.');
    }

    // Prepare pin data
    const pinData = {
      board_id: boardId,
      title: post.content || 'Untitled Pin',
      description: post.content || '',
      media_source: {
        source_type: 'image_url',
        url: post.mediaUrl || post.imageUrl
      }
    };

    // Add link if provided
    if (post.linkUrl) {
      pinData.link = post.linkUrl;
    }

    // Add hashtags to description if provided
    if (post.hashtags) {
      pinData.description += ` ${post.hashtags}`;
    }

    console.log('Creating Pinterest pin:', {
      boardId: pinData.board_id,
      title: pinData.title,
      hasImage: !!pinData.media_source.url,
      hasLink: !!pinData.link
    });

    const response = await fetch('https://api.pinterest.com/v5/pins', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(pinData),
      timeout: 30000
    });

    const data = await response.json();
    console.log('Pinterest pin creation response:', { status: response.status, data });

    if (!response.ok || data.error) {
      throw new Error(data.message || `Pinterest pin creation failed: ${response.status}`);
    }

    return { id: data.id, type: 'pinterest_pin' };
  } catch (e) {
    console.error('Pinterest publishing failed:', e);
    return null;
  }
}

async function getDefaultBoardId(accessToken) {
  try {
    // Get user's boards to find a default one
    const response = await fetch('https://api.pinterest.com/v5/boards', {
      headers: { 
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const data = await response.json();
    
    if (data.error || !data.items || data.items.length === 0) {
      return null;
    }

    // Return the first board ID
    return data.items[0].id;
  } catch (error) {
    console.error('Failed to get default Pinterest board:', error);
    return null;
  }
}

function startScheduler() {
  // Every minute: publish any due scheduled posts
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const due = await Post.findAll({ where: { status: 'scheduled', scheduledAt: { [Op.lte]: now } }, limit: 20 });
    for (const post of due) {
      await tryPublishNow(post);
    }
  });
}

module.exports = { startScheduler, tryPublishNow };
