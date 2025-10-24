const { Op } = require('sequelize');
const { ContentCategory } = require('../models/contentCategory');
const { ContentItem } = require('../models/contentItem');
const { Post } = require('../models/post');
const { tryPublishNow } = require('../scheduler');
const axios = require('axios');

// Google Gemini AI
let GoogleGenerativeAI;
try { 
  GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI; 
} catch (_) { 
  GoogleGenerativeAI = null; 
}

let geminiModel = null;
try {
  if (GoogleGenerativeAI && process.env.GOOGLE_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const requested = process.env.GEMINI_MODEL || '';
    const sdkModelId = (requested && requested.startsWith('models/')) ? requested.split('/').pop() : (requested || 'gemini-2.5-flash');
    try {
      geminiModel = genAI.getGenerativeModel({ model: sdkModelId });
      console.log('[Content AI] Using Gemini model:', sdkModelId);
    } catch (_) {
      geminiModel = null;
    }
  }
} catch (_) {
  geminiModel = null;
}

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
  
  // Delete reminders for all items in this category first
  try {
    const { Reminder } = require('../models/reminder');
    const items = await ContentItem.findAll({ where: { categoryId: id } });
    const itemIds = items.map(item => item.id);
    
    if (itemIds.length > 0) {
      await Reminder.destroy({ where: { contentItemId: itemIds } });
      console.log(`[Content] Deleted reminders for ${itemIds.length} items in category ${id}`);
    }
  } catch (error) {
    console.log(`[Content] No reminders to delete for category ${id}:`, error.message);
  }
  
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
  
  // Delete related reminders first to avoid foreign key constraint error
  try {
    const { Reminder } = require('../models/reminder');
    await Reminder.destroy({ where: { contentItemId: id } });
    console.log(`[Content] Deleted reminders for content item ${id}`);
  } catch (error) {
    console.log(`[Content] No reminders to delete for item ${id}:`, error.message);
  }
  
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
  // Try Google Gemini first if available
  if (geminiModel && process.env.GOOGLE_API_KEY) {
    try {
      console.log('[Content AI] Generating content with Google Gemini...');
      
      const systemPrompt = `أنت خبير في إنشاء المحتوى التسويقي للشبكات الاجتماعية. 
      أنشئ محتوى احترافي وجذاب باللغة العربية بناءً على الطلب التالي.
      
      المنصة: ${platform || 'عام'}
      النبرة: ${tone || 'احترافي'}
      الطول: ${length || 'متوسط'}
      
      المطلوب: ${prompt}
      
      يرجى إنشاء محتوى:
      - جذاب ومقنع
      - مناسب للمنصة المحددة
      - باللغة العربية الفصحى
      - يتضمن هاشتاغات مناسبة
      - يتضمن إيموجي مناسب
      - يتضمن دعوة للعمل واضحة
      - يتراوح بين 50-200 كلمة حسب الطول المطلوب`;

      const result = await geminiModel.generateContent(systemPrompt);
      const generatedText = result?.response?.text?.() || result?.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      if (generatedText && generatedText.trim()) {
        console.log('[Content AI] Successfully generated content with Gemini');
        return generatedText.trim();
      }
    } catch (error) {
      console.error('[Content AI] Gemini error:', error);
      
      // Fallback to HTTP API if SDK fails
      try {
        const httpModel = process.env.GEMINI_MODEL || 'models/gemini-2.5-flash';
        const httpText = await callGeminiHTTP(httpModel, systemPrompt);
        if (httpText && httpText.trim()) {
          console.log('[Content AI] Successfully generated content with Gemini HTTP API');
          return httpText.trim();
        }
      } catch (httpError) {
        console.error('[Content AI] Gemini HTTP error:', httpError);
      }
    }
  }
  
  // Fallback to local generation if Gemini is not available
  console.log('[Content AI] Falling back to local content generation');
  
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

// HTTP fallback for Gemini
async function callGeminiHTTP(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`;
  const body = {
    contents: [
      { role: 'user', parts: [{ text: prompt }] }
    ]
  };
  const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini HTTP ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text?.trim();
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


