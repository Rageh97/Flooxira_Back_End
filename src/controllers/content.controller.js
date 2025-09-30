const { Op } = require('sequelize');
const { ContentCategory } = require('../models/contentCategory');
const { ContentItem } = require('../models/contentItem');
const { Post } = require('../models/post');
const { tryPublishNow } = require('../scheduler');

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
  return res.json({ items });
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
    attachments: Array.isArray(attachments) ? attachments : [],
    status
  });
  return res.status(201).json({ item });
}

async function getItem(req, res) {
  const { id } = req.params;
  const item = await ContentItem.findOne({ where: { id, userId: req.userId } });
  if (!item) return res.status(404).json({ message: 'Not found' });
  return res.json({ item });
}

async function updateItem(req, res) {
  const { id } = req.params;
  const item = await ContentItem.findOne({ where: { id, userId: req.userId } });
  if (!item) return res.status(404).json({ message: 'Not found' });
  const { title, body, attachments, status, platforms, scheduledAt, timezoneOffset } = req.body || {};
  if (title !== undefined) item.title = title;
  if (body !== undefined) item.body = body;
  if (attachments !== undefined) item.attachments = Array.isArray(attachments) ? attachments : [];
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
  return res.json({ item });
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
  scheduleItem
};


