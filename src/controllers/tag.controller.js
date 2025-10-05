const { Op } = require('sequelize');
const { Tag, ContactTag } = require('../models/tag');

exports.createTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, color } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const tag = await Tag.create({ userId, name: String(name).trim(), color: color || null });
    return res.json({ success: true, data: tag });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.getTags = async (req, res) => {
  try {
    const userId = req.user.id;
    const tags = await Tag.findAll({ where: { userId }, order: [['name', 'ASC']] });
    return res.json({ success: true, data: tags });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = parseInt(req.params.id);
    const { name, color } = req.body;
    const tag = await Tag.findOne({ where: { id, userId } });
    if (!tag) return res.status(404).json({ success: false, message: 'Not found' });
    await tag.update({ name: name ?? tag.name, color: color ?? tag.color });
    return res.json({ success: true, data: tag });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = parseInt(req.params.id);
    const tag = await Tag.findOne({ where: { id, userId } });
    if (!tag) return res.status(404).json({ success: false, message: 'Not found' });
    await ContactTag.destroy({ where: { userId, tagId: id } });
    await tag.destroy();
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.addContactToTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactNumber, contactName, tagName, tagId } = req.body;
    const paramId = req.params && req.params.id ? parseInt(req.params.id) : null;
    if (!contactNumber) return res.status(400).json({ success: false, message: 'contactNumber required' });

    let tag = null;
    // Priority: route param id > body tagId > tagName
    if (paramId) {
      tag = await Tag.findOne({ where: { id: paramId, userId } });
      if (!tag) return res.status(404).json({ success: false, message: 'Tag not found' });
    } else if (tagId) {
      tag = await Tag.findOne({ where: { id: tagId, userId } });
      if (!tag) return res.status(404).json({ success: false, message: 'Tag not found' });
    } else if (tagName) {
      tag = await Tag.findOne({ where: { userId, name: tagName } });
      if (!tag) tag = await Tag.create({ userId, name: tagName });
    } else {
      return res.status(400).json({ success: false, message: 'tagId or tagName or route id required' });
    }

    // Check if contact already exists in this tag
    const existingContact = await ContactTag.findOne({
      where: { userId, tagId: tag.id, contactNumber }
    });
    
    if (existingContact) {
      return res.status(400).json({ 
        success: false, 
        message: 'Contact already exists in this tag' 
      });
    }
    
    const record = await ContactTag.create({
      userId, 
      tagId: tag.id, 
      contactNumber, 
      contactName: contactName || null
    });
    return res.json({ success: true, data: record });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.removeContactFromTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contactNumber } = req.body;
    const id = parseInt(req.params.id);
    if (!contactNumber) return res.status(400).json({ success: false, message: 'contactNumber required' });
    const count = await ContactTag.destroy({ where: { userId, tagId: id, contactNumber } });
    return res.json({ success: true, removed: count });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.listContactsByTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const id = parseInt(req.params.id);
    const items = await ContactTag.findAll({ where: { userId, tagId: id }, order: [['createdAt', 'DESC']] });
    return res.json({ success: true, data: items });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// Get all available contacts/numbers for the user
exports.getAllContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { WhatsappChat } = require('../models/whatsappChat');
    
    // Get all unique contact numbers from WhatsApp chats
    const contacts = await WhatsappChat.findAll({
      where: { userId },
      attributes: ['contactNumber'],
      group: ['contactNumber'],
      order: [['contactNumber', 'ASC']]
    });
    
    const contactNumbers = contacts.map(chat => chat.contactNumber).filter(Boolean);
    
    return res.json({ success: true, data: contactNumbers });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};


