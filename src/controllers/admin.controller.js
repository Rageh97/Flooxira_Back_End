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

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows: users } = await User.findAndCountAll({
      attributes: ['id', 'name', 'email', 'phone', 'role', 'isActive', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.json({ 
      success: true, 
      users,
      total: count,
      totalPages,
      currentPage: page,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    });
  } catch (e) {
    console.error('Error fetching users:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch users', error: e.message });
  }
}

async function getUserDetails(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const { UserSubscription } = require('../models/userSubscription');
    const { Plan } = require('../models/plan');
    const { SubscriptionRequest } = require('../models/subscriptionRequest');

    const user = await User.findByPk(userId, {
      attributes: ['id', 'name', 'email', 'phone', 'role', 'isActive', 'emailVerifiedAt', 'botPaused', 'botPausedUntil', 'createdAt', 'updatedAt']
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get user's subscriptions
    const subscriptions = await UserSubscription.findAll({
      where: { userId: userId },
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'priceCents', 'interval', 'features', 'permissions']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Get subscription requests
    const subscriptionRequests = await SubscriptionRequest.findAll({
      where: { userId: userId },
      include: [
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'priceCents', 'interval']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ 
      success: true, 
      user: {
        ...user.toJSON(),
        subscriptions: subscriptions.map(sub => ({
          ...sub.toJSON(),
          plan: sub.plan
        })),
        subscriptionRequests: subscriptionRequests.map(req => ({
          ...req.toJSON(),
          plan: req.plan
        }))
      }
    });
  } catch (e) {
    console.error('Error fetching user details:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch user details', error: e.message });
  }
}

async function updateUserStatus(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { userId } = req.params;
    const { isActive } = req.body;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: 'isActive must be a boolean value' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Prevent admin from deactivating themselves
    if (user.id === req.user.id && !isActive) {
      return res.status(400).json({ success: false, message: 'Cannot deactivate your own account' });
    }

    user.isActive = isActive;
    await user.save();

    res.json({ 
      success: true, 
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isActive: user.isActive
      }
    });
  } catch (e) {
    console.error('Error updating user status:', e);
    res.status(500).json({ success: false, message: 'Failed to update user status', error: e.message });
  }
}

async function getAllSubscriptions(req, res) {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied. Admin role required.' });
    }

    const { UserSubscription } = require('../models/userSubscription');
    const { Plan } = require('../models/plan');

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filter = req.query.filter || 'all';
    const offset = (page - 1) * limit;

    // Build where clause based on filter
    let whereClause = {};
    if (filter !== 'all') {
      whereClause.status = filter;
    }

    const { count, rows: subscriptions } = await UserSubscription.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'phone', 'isActive']
        },
        {
          model: Plan,
          as: 'plan',
          attributes: ['id', 'name', 'priceCents', 'interval', 'features', 'permissions']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const totalPages = Math.ceil(count / limit);

    res.json({ 
      success: true, 
      subscriptions: subscriptions.map(sub => ({
        ...sub.toJSON(),
        user: sub.user,
        plan: sub.plan
      })),
      total: count,
      totalPages,
      currentPage: page,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    });
  } catch (e) {
    console.error('Error fetching subscriptions:', e);
    res.status(500).json({ success: false, message: 'Failed to fetch subscriptions', error: e.message });
  }
}

module.exports = { listAgents, listChats, assignChat, getAllUsers, getUserDetails, updateUserStatus, getAllSubscriptions };



