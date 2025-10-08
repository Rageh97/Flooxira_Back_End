const { Op } = require('sequelize');
const { ContentCategory } = require('../models/contentCategory');
const { ContentItem } = require('../models/contentItem');
const { Post } = require('../models/post');
const { tryPublishNow } = require('../scheduler');
const axios = require('axios');

// Categories
async function listCategories(req, res) {
  const categories = await ContentCategory.findAll({
    where: { userId: req.userId },
    order: [['createdAt', 'DESC']]
  });
  return res.json({ categories });
}

async function createCategory(req, res) {
  const { name, description } = req.body || {};
  if (!name) return res.status(400).json({ message: 'name is required' });
  const category = await ContentCategory.create({ userId: req.userId, name, description: description || null });
  return res.status(201).json({ category });
}

async function updateCategory(req, res) {
  const { id } = req.params;
  const category = await ContentCategory.findOne({ where: { id, userId: req.userId } });
  if (!category) return res.status(404).json({ message: 'Not found' });
  const { name, description } = req.body || {};
  if (name !== undefined) category.name = name;
  if (description !== undefined) category.description = description;
  await category.save();
  return res.json({ category });
}

async function deleteCategory(req, res) {
  const { id } = req.params;
  const category = await ContentCategory.findOne({ where: { id, userId: req.userId } });
  if (!category) return res.status(404).json({ message: 'Not found' });
  await category.destroy();
  return res.json({ ok: true });
}

// Items
async function listItems(req, res) {
  const { categoryId } = req.params;
  const items = await ContentItem.findAll({
    where: { userId: req.userId, categoryId },
    order: [['updatedAt', 'DESC']]
  });
  const normalized = items.map((it) => {
    try {
      const raw = it.get({ plain: true });
      if (raw && raw.attachments && typeof raw.attachments === 'string') {
        raw.attachments = JSON.parse(raw.attachments);
      }
      return raw;
    } catch {
      return it;
    }
  });
  return res.json({ items: normalized });
}

async function createItem(req, res) {
  const { categoryId } = req.params;
  const { title, body, attachments, status = 'draft' } = req.body || {};
  if (!title) return res.status(400).json({ message: 'title is required' });
  const item = await ContentItem.create({
    userId: req.userId,
    categoryId,
    title,
    body: body || null,
    attachments: Array.isArray(attachments) ? attachments : (attachments ? [attachments] : []),
    status
  });
  const plain = item.get({ plain: true });
  return res.status(201).json({ item: plain });
}

async function getItem(req, res) {
  const { id } = req.params;
  const item = await ContentItem.findOne({ where: { id, userId: req.userId } });
  if (!item) return res.status(404).json({ message: 'Not found' });
  let plain = item.get({ plain: true });
  if (plain && plain.attachments && typeof plain.attachments === 'string') {
    try { plain.attachments = JSON.parse(plain.attachments); } catch {}
  }
  return res.json({ item: plain });
}

async function updateItem(req, res) {
  const { id } = req.params;
  const item = await ContentItem.findOne({ where: { id, userId: req.userId } });
  if (!item) return res.status(404).json({ message: 'Not found' });
  const { title, body, attachments, status, platforms, scheduledAt, timezoneOffset } = req.body || {};
  if (title !== undefined) item.title = title;
  if (body !== undefined) item.body = body;
  if (attachments !== undefined) item.attachments = Array.isArray(attachments) ? attachments : (attachments ? [attachments] : []);
  if (status !== undefined) item.status = status;
  if (platforms !== undefined) item.platforms = Array.isArray(platforms) ? platforms : [];
  if (scheduledAt !== undefined) {
    let finalScheduledAt = scheduledAt;
    if (scheduledAt && timezoneOffset !== undefined) {
      const localDate = new Date(scheduledAt);
      const userOffset = parseInt(timezoneOffset);
      const serverOffset = new Date().getTimezoneOffset();
      const timezoneDifference = userOffset - serverOffset;
      finalScheduledAt = new Date(localDate.getTime() + (timezoneDifference * 60 * 1000));
    }
    item.scheduledAt = finalScheduledAt;
  }
  await item.save();
  const plain = item.get({ plain: true });
  return res.json({ item: plain });
}

async function deleteItem(req, res) {
  const { id } = req.params;
  const item = await ContentItem.findOne({ where: { id, userId: req.userId } });
  if (!item) return res.status(404).json({ message: 'Not found' });
  await item.destroy();
  return res.json({ ok: true });
}

// Convert a content item into a scheduled Post using existing pipeline
async function scheduleItem(req, res) {
  const { id } = req.params;
  const { platforms = [], format = 'feed', scheduledAt, timezoneOffset } = req.body || {};
  const item = await ContentItem.findOne({ where: { id, userId: req.userId } });
  if (!item) return res.status(404).json({ message: 'Not found' });

  let finalScheduledAt = scheduledAt || item.scheduledAt;
  if (finalScheduledAt && timezoneOffset !== undefined) {
    const localDate = new Date(finalScheduledAt);
    const userOffset = parseInt(timezoneOffset);
    const serverOffset = new Date().getTimezoneOffset();
    const timezoneDifference = userOffset - serverOffset;
    finalScheduledAt = new Date(localDate.getTime() + (timezoneDifference * 60 * 1000));
  }

  const firstAttachment = Array.isArray(item.attachments) && item.attachments.length > 0 ? item.attachments[0] : null;
  const postPayload = {
    userId: req.userId,
    type: firstAttachment ? (firstAttachment.type === 'video' ? 'video' : 'photo') : 'text',
    content: item.body || item.title,
    mediaUrl: firstAttachment ? firstAttachment.url : null,
    imageUrl: firstAttachment && firstAttachment.type === 'image' ? firstAttachment.url : null,
    format,
    scheduledAt: finalScheduledAt || null,
    status: finalScheduledAt ? 'scheduled' : 'draft',
    platforms
  };

  const post = await Post.create(postPayload);
  if (!finalScheduledAt) {
    await tryPublishNow(post);
  }

  return res.status(201).json({ post });
}

// AI Content Generation
async function generateAIContent(req, res) {
  const { prompt, platform, tone = 'professional', length = 'medium' } = req.body || {};
  
  if (!prompt) {
    return res.status(400).json({ message: 'prompt is required' });
  }

  try {
    // For demo purposes, we'll generate content locally
    // In production, you would call OpenAI API or similar service
    const generatedContent = await generateContentLocally(prompt, platform, tone, length);
    
    return res.json({ 
      content: generatedContent,
      prompt: prompt,
      platform: platform,
      tone: tone,
      length: length
    });
  } catch (error) {
    console.error('AI content generation error:', error);
    return res.status(500).json({ message: 'Failed to generate content' });
  }
}

async function generateContentLocally(prompt, platform, tone, length) {
  // This is a simple local content generator for demo purposes
  // In production, replace this with actual AI service calls
  
  const platformTemplates = {
    facebook: 'منشور فيسبوك جذاب',
    instagram: 'منشور إنستغرام بصري',
    linkedin: 'مقال لينكد إن احترافي',
    twitter: 'تغريدة تويتر مختصرة',
    youtube: 'وصف فيديو يوتيوب',
    tiktok: 'وصف تيك توك ممتع'
  };

  const toneTemplates = {
    professional: 'احترافي ومهني',
    casual: 'ودود ومرح',
    formal: 'رسمي ومهيب',
    friendly: 'ودود ومقرب'
  };

  const lengthTemplates = {
    short: 'مختصر ومفيد',
    medium: 'متوسط الطول',
    long: 'مفصل وشامل'
  };

  const platformText = platformTemplates[platform] || 'منشور اجتماعي';
  const toneText = toneTemplates[tone] || 'احترافي';
  const lengthText = lengthTemplates[length] || 'متوسط';

  return `[${platformText} - ${toneText} - ${lengthText}]

بناءً على طلبك: "${prompt}"

هذا محتوى مُولد بالذكاء الاصطناعي يمكن تخصيصه حسب احتياجاتك. يمكنك تعديل النص وإضافة المزيد من التفاصيل أو تغيير النبرة حسب ما يناسب جمهورك المستهدف.

نصائح للتحسين:
- أضف هاشتاغات مناسبة للمنصة
- استخدم إيموجي لجذب الانتباه
- أضف دعوة للعمل واضحة
- تأكد من أن المحتوى يتناسب مع هوية علامتك التجارية

يمكنك نسخ هذا المحتوى واستخدامه كأساس لمنشورك، أو طلب تعديلات إضافية.`;
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listItems,
  createItem,
  getItem,
  updateItem,
  deleteItem,
  scheduleItem,
  generateAIContent
};


