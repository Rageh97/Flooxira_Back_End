const { Post } = require('../models/post');
const { tryPublishNow } = require('../scheduler');

async function listPosts(req, res) {
  const where = { userId: req.userId };
  if (req.query.status) where.status = req.query.status;
  if (req.query.platform) where.platforms = { [require('sequelize').Op.contains]: [req.query.platform] };
  
  const posts = await Post.findAll({ 
    where, 
    order: [['scheduledAt', 'ASC'], ['createdAt', 'DESC']] 
  });
  return res.json({ posts });
}

async function createPost(req, res) {
  const { 
    type = 'text', 
    content, 
    linkUrl, 
    mediaUrl, 
    imageUrl, 
    hashtags, 
    format = 'feed', 
    scheduledAt,
    timezoneOffset,
    platforms = ['facebook'], // Default to Facebook, can include 'instagram', 'pinterest', 'linkedin', 'tiktok', 'youtube'
    pinterestBoardId
  } = req.body;
  const effectiveMediaUrl = mediaUrl || imageUrl || null;
  
  // Validation
  if (!content && !effectiveMediaUrl && !linkUrl) {
    return res.status(400).json({ message: 'Content, media, or link is required' });
  }
  
  // For reels, ensure it's video type and has media
  if (format === 'reel') {
    if (type !== 'video') {
      return res.status(400).json({ message: 'Reels must be video type' });
    }
    if (!effectiveMediaUrl) {
      return res.status(400).json({ message: 'mediaUrl is required for reels' });
    }
  }
  
  // For stories, ensure mediaUrl is present
  if (format === 'story') {
    if (!effectiveMediaUrl) {
      return res.status(400).json({ message: 'mediaUrl is required for stories' });
    }
    if (type !== 'photo' && type !== 'video') {
      return res.status(400).json({ message: 'Stories must be photo or video type' });
    }
  }
  
  // For photo/video types, ensure mediaUrl is present
  if ((type === 'photo' || type === 'video') && !effectiveMediaUrl) {
    return res.status(400).json({ message: 'mediaUrl is required for photo/video posts' });
  }
  
  // Handle timezone for scheduled posts
  let finalScheduledAt = scheduledAt;
  if (scheduledAt && timezoneOffset !== undefined) {
    console.log(`[Posts] Timezone handling - User offset: ${timezoneOffset}, Server offset: ${new Date().getTimezoneOffset()}`);
    console.log(`[Posts] Original scheduledAt: ${scheduledAt}`);
    
    // Parse the datetime-local string as local time
    const localDate = new Date(scheduledAt);
    console.log(`[Posts] Parsed local date: ${localDate.toISOString()}`);
    
    // Calculate timezone difference
    const userOffset = parseInt(timezoneOffset); // User's offset in minutes
    const serverOffset = new Date().getTimezoneOffset(); // Server's offset in minutes
    const timezoneDifference = userOffset - serverOffset; // Difference in minutes
    console.log(`[Posts] Timezone difference: ${timezoneDifference} minutes`);
    
    // Adjust the scheduled date
    const adjustedDate = new Date(localDate.getTime() + (timezoneDifference * 60 * 1000));
    finalScheduledAt = adjustedDate;
    console.log(`[Posts] Final scheduledAt: ${finalScheduledAt.toISOString()}`);
  }

  const status = finalScheduledAt ? 'scheduled' : 'draft';
  const post = await Post.create({ 
    userId: req.userId, 
    type, 
    content, 
    linkUrl, 
    mediaUrl: effectiveMediaUrl, 
    imageUrl: effectiveMediaUrl, 
    hashtags, 
    format, 
    scheduledAt: finalScheduledAt || null, 
    status,
    platforms,
    pinterestBoardId: pinterestBoardId || null
  });

  console.log('📝 Post created:', {
    id: post.id,
    type: post.type,
    status: post.status,
    platforms: post.platforms,
    scheduledAt: post.scheduledAt,
    hasContent: !!post.content,
    hasMedia: !!post.mediaUrl
  });
  
  // If no schedule provided, publish immediately
  if (!scheduledAt) {
    console.log('🚀 Publishing post immediately with platforms:', platforms);
    try {
      const publishResult = await tryPublishNow(post);
      if (publishResult) {
        console.log('✅ Post published successfully to at least one platform');
        post.status = 'published';
        post.error = null;
        await post.save();
      } else {
        console.log('❌ Post failed to publish to any platform');
        post.status = 'failed';
        post.error = 'Failed to publish to any platform';
        await post.save();
      }
    } catch (publishError) {
      console.error('❌ Error during immediate publishing:', publishError.message);
      post.status = 'failed';
      post.error = publishError.message;
      await post.save();
    }
  } else {
    console.log('📅 Post scheduled for:', finalScheduledAt);
    console.log('⏰ Post will be published automatically at the scheduled time');
  }
  
  return res.status(201).json({ post });
}

async function updatePost(req, res) {
  const { id } = req.params;
  const post = await Post.findOne({ where: { id, userId: req.userId } });
  if (!post) return res.status(404).json({ message: 'Not found' });
  
  const { content, imageUrl, scheduledAt, status, platforms } = req.body;
  if (content !== undefined) post.content = content;
  if (imageUrl !== undefined) post.imageUrl = imageUrl;
  if (scheduledAt !== undefined) post.scheduledAt = scheduledAt;
  if (status !== undefined) post.status = status;
  if (platforms !== undefined) post.platforms = platforms;
  
  await post.save();
  return res.json({ post });
}

async function deletePost(req, res) {
  const { id } = req.params;
  const post = await Post.findOne({ where: { id, userId: req.userId } });
  if (!post) return res.status(404).json({ message: 'Not found' });
  await post.destroy();
  return res.json({ ok: true });
}

async function stats(req, res) {
  const userId = req.userId;
  const [published, scheduled, draft, failed] = await Promise.all([
    Post.count({ where: { userId, status: 'published' } }),
    Post.count({ where: { userId, status: 'scheduled' } }),
    Post.count({ where: { userId, status: 'draft' } }),
    Post.count({ where: { userId, status: 'failed' } }),
  ]);
  
  // Platform-specific stats - using SQLite-compatible JSON operations
  const [facebookPosts, instagramPosts, linkedinPosts, pinterestPosts] = await Promise.all([
    Post.count({ 
      where: { 
        userId,
        platforms: require('sequelize').literal(`JSON_EXTRACT(platforms, '$') LIKE '%"facebook"%'`)
      } 
    }),
    Post.count({ 
      where: { 
        userId,
        platforms: require('sequelize').literal(`JSON_EXTRACT(platforms, '$') LIKE '%"instagram"%'`)
      } 
    }),
    Post.count({ 
      where: { 
        userId,
        platforms: require('sequelize').literal(`JSON_EXTRACT(platforms, '$') LIKE '%"linkedin"%'`)
      } 
    }),
    Post.count({ 
      where: { 
        userId,
        platforms: require('sequelize').literal(`JSON_EXTRACT(platforms, '$') LIKE '%"pinterest"%'`)
      } 
    })
  ]);
  
  return res.json({ 
    published, 
    scheduled, 
    draft, 
    failed,
    facebookPosts,
    instagramPosts,
    linkedinPosts,
    pinterestPosts
  });
}

module.exports = { listPosts, createPost, updatePost, deletePost, stats };
