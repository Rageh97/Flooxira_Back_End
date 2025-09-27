const { User } = require('../models/user');
const { WhatsappChat } = require('../models/whatsappChat');

async function listAgents(req, res) {
  try {
    console.log('listAgents called, req.user:', req.user);
    
    // Check if req.user exists
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    // For WhatsApp management, we'll return the current user as the only "agent"
    // since this is for managing their own WhatsApp number's chats
    const agents = [{
      id: req.user.id,
      name: req.user.name || 'Unknown',
      email: req.user.email || 'unknown@example.com'
    }];
    
    console.log('Returning agents:', agents);
    res.json({ success: true, agents });
  } catch (e) {
    console.error('Error listing agents:', e);
    res.status(500).json({ success: false, message: 'Failed to list agents', error: e.message });
  }
}

async function listChats(req, res) {
  try {
    const { contactNumber, assigneeId, limit = 50, offset = 0 } = req.query;
    const where = { userId: req.user.id }; // Only show chats for the current user's WhatsApp
    if (contactNumber) where.contactNumber = contactNumber;
    if (assigneeId) where.assigneeId = assigneeId;
    
    // Try to include assignee, but handle case where column doesn't exist
    let includeOptions = [];
    try {
      includeOptions = [
        { model: User, as: 'Assignee', attributes: ['id', 'name', 'email'], required: false }
      ];
    } catch (includeError) {
      console.log('Assignee column not available, skipping include');
    }
    
    const chats = await WhatsappChat.findAll({ 
      where, 
      order: [['timestamp', 'DESC']], 
      limit: parseInt(limit), 
      offset: parseInt(offset),
      include: includeOptions
    });
    res.json({ success: true, chats });
  } catch (e) {
    console.error('Error listing chats:', e);
    
    // If it's a column error, try without the include
    if (e.message && e.message.includes('assigneeId')) {
      try {
        console.log('Retrying without assignee include...');
        const chats = await WhatsappChat.findAll({ 
          where: { userId: req.user.id }, 
          order: [['timestamp', 'DESC']], 
          limit: parseInt(req.query.limit || 50), 
          offset: parseInt(req.query.offset || 0)
        });
        return res.json({ success: true, chats });
      } catch (retryError) {
        console.error('Retry also failed:', retryError);
      }
    }
    
    res.status(500).json({ success: false, message: 'Failed to list chats', error: e.message });
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
    
    // Check if assigneeId column exists
    try {
      chat.assigneeId = assigneeId || null;
      await chat.save();
      res.json({ success: true });
    } catch (columnError) {
      if (columnError.message && (columnError.message.includes('assigneeId') || columnError.message.includes('Unknown column'))) {
        return res.status(400).json({ 
          success: false, 
          message: 'Assignee feature not available. The database needs to be recreated with the latest schema. Please redeploy your backend.' 
        });
      }
      throw columnError;
    }
  } catch (e) {
    console.error('Error assigning chat:', e);
    res.status(500).json({ success: false, message: 'Failed to assign chat' });
  }
}

async function getAllUsers(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const users = await User.findAll({
      attributes: ['id', 'name', 'email', 'phone', 'role', 'isActive', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']]
    });

    res.json({ success: true, users });
  } catch (e) {
    console.error('Error fetching users:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch users', error: e.message });
  }
}

module.exports = { listAgents, listChats, assignChat, getAllUsers };



