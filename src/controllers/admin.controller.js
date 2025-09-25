const { User } = require('../models/user');
const { WhatsappChat } = require('../models/whatsappChat');

async function listAgents(req, res) {
  try {
    const agents = await User.findAll({ where: { role: 'user' }, attributes: ['id', 'name', 'email'] });
    res.json({ success: true, agents });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list agents' });
  }
}

async function listChats(req, res) {
  try {
    const { contactNumber, assigneeId, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (contactNumber) where.contactNumber = contactNumber;
    if (assigneeId) where.assigneeId = assigneeId;
    const chats = await WhatsappChat.findAll({ where, order: [['timestamp', 'DESC']], limit: parseInt(limit), offset: parseInt(offset) });
    res.json({ success: true, chats });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list chats' });
  }
}

async function assignChat(req, res) {
  try {
    const { chatId, assigneeId } = req.body;
    if (!chatId) return res.status(400).json({ success: false, message: 'chatId required' });
    const chat = await WhatsappChat.findByPk(chatId);
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    chat.assigneeId = assigneeId || null;
    await chat.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to assign chat' });
  }
}

module.exports = { listAgents, listChats, assignChat };


