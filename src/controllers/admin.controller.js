const { User } = require('../models/user');
const { WhatsappChat } = require('../models/whatsappChat');

async function listAgents(req, res) {
  try {
    // For WhatsApp management, we'll return the current user as the only "agent"
    // since this is for managing their own WhatsApp number's chats
    const agents = [{
      id: req.user.id,
      name: req.user.name,
      email: req.user.email
    }];
    res.json({ success: true, agents });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list agents' });
  }
}

async function listChats(req, res) {
  try {
    const { contactNumber, assigneeId, limit = 50, offset = 0 } = req.query;
    const where = { userId: req.user.id }; // Only show chats for the current user's WhatsApp
    if (contactNumber) where.contactNumber = contactNumber;
    if (assigneeId) where.assigneeId = assigneeId;
    const chats = await WhatsappChat.findAll({ 
      where, 
      order: [['timestamp', 'DESC']], 
      limit: parseInt(limit), 
      offset: parseInt(offset),
      include: [
        { model: User, as: 'Assignee', attributes: ['id', 'name', 'email'] }
      ]
    });
    res.json({ success: true, chats });
  } catch (e) {
    console.error('Error listing chats:', e);
    res.status(500).json({ success: false, message: 'Failed to list chats' });
  }
}

async function assignChat(req, res) {
  try {
    const { chatId, assigneeId } = req.body;
    if (!chatId) return res.status(400).json({ success: false, message: 'chatId required' });
    
    // Only allow assigning chats that belong to the current user
    const chat = await WhatsappChat.findOne({ 
      where: { id: chatId, userId: req.user.id } 
    });
    if (!chat) return res.status(404).json({ success: false, message: 'Chat not found' });
    
    chat.assigneeId = assigneeId || null;
    await chat.save();
    res.json({ success: true });
  } catch (e) {
    console.error('Error assigning chat:', e);
    res.status(500).json({ success: false, message: 'Failed to assign chat' });
  }
}

module.exports = { listAgents, listChats, assignChat };



