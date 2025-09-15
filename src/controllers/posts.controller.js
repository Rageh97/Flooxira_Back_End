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
    platforms = ['facebook'] // Default to Facebook, can include 'instagram'
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
  
  const status = scheduledAt ? 'scheduled' : 'draft';
  const post = await Post.create({ 
    userId: req.userId, 
    type, 
    content, 
    linkUrl, 
    mediaUrl: effectiveMediaUrl, 
    imageUrl: effectiveMediaUrl, 
    hashtags, 
    format, 
    scheduledAt: scheduledAt || null, 
    status,
    platforms
  });
  
  // If no schedule provided, publish immediately
  if (!scheduledAt) {
    console.log('Publishing post immediately with platforms:', platforms);
    await tryPublishNow(post);
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
  const [facebookPosts, instagramPosts, linkedinPosts] = await Promise.all([
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
    })
  ]);
  
  return res.json({ 
    published, 
    scheduled, 
    draft, 
    failed,
    facebookPosts,
    instagramPosts,
    linkedinPosts
  });
}

module.exports = { listPosts, createPost, updatePost, deletePost, stats };
