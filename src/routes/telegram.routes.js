const express = require('express');
const router = express.Router();
const { requireAuth, requireEmployeeAuth } = require('../middleware/auth');
const TelegramGroup = require('../models/telegramGroup');
const TelegramBotAccount = require('../models/telegramBotAccount');
const tgBotService = require('../services/telegramBotService');
const axios = require('axios');

// Sync groups/channels from Telegram API
router.post('/sync-groups', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get bot token
    const botAccount = await TelegramBotAccount.findOne({ where: { userId } });
    
    if (!botAccount || !botAccount.token) {
      return res.status(400).json({
        success: false,
        message: 'Telegram bot not configured. Please set up your bot first.'
      });
    }

    console.log(`[Telegram Sync] Starting sync for user ${userId}`);

    // Get bot info first
    const botInfoUrl = `https://api.telegram.org/bot${botAccount.token}/getMe`;
    const botInfoResponse = await axios.get(botInfoUrl, { timeout: 5000 });
    
    if (!botInfoResponse.data?.ok) {
      throw new Error('Failed to get bot info from Telegram');
    }
    
    const botId = botInfoResponse.data.result.id;
    console.log(`[Telegram Sync] Bot ID: ${botId}`);

    // Delete webhook if exists (to allow getUpdates)
    try {
      console.log(`[Telegram Sync] Checking/deleting webhook...`);
      const deleteWebhookUrl = `https://api.telegram.org/bot${botAccount.token}/deleteWebhook`;
      await axios.get(deleteWebhookUrl, { timeout: 5000 });
      console.log(`[Telegram Sync] Webhook deleted successfully`);
    } catch (webhookError) {
      console.warn(`[Telegram Sync] Warning deleting webhook:`, webhookError.message);
      // Continue anyway
    }

    // Get updates from Telegram to discover groups/channels
    const updatesUrl = `https://api.telegram.org/bot${botAccount.token}/getUpdates`;
    const updatesResponse = await axios.get(updatesUrl, { timeout: 10000 });
    
    if (!updatesResponse.data?.ok) {
      throw new Error('Failed to get updates from Telegram');
    }

    const synced = [];
    const updates = updatesResponse.data.result || [];
    
    // Extract unique chats from updates
    const chatsMap = new Map();
    
    for (const update of updates) {
      const message = update.message || update.my_chat_member?.chat;
      if (!message) continue;
      
      const chat = message.chat || message;
      
      if (chat && (chat.type === 'group' || chat.type === 'supergroup' || chat.type === 'channel')) {
        chatsMap.set(chat.id.toString(), {
          chatId: chat.id.toString(),
          name: chat.title || chat.username || `Chat ${chat.id}`,
          type: chat.type
        });
      }
    }

    console.log(`[Telegram Sync] Found ${chatsMap.size} groups/channels in updates`);

    // Check admin status and save to database
    for (const [chatId, chatInfo] of chatsMap) {
      try {
        // Check if bot is admin
        const adminUrl = `https://api.telegram.org/bot${botAccount.token}/getChatMember?chat_id=${chatId}&user_id=${botId}`;
        const adminResponse = await axios.get(adminUrl, { timeout: 5000 });
        
        const isAdmin = adminResponse.data?.ok && 
          ['administrator', 'creator'].includes(adminResponse.data.result?.status);

        console.log(`[Telegram Sync] ${chatInfo.name} (${chatId}): Admin = ${isAdmin}`);

        // Save or update in database
        const [group, created] = await TelegramGroup.findOrCreate({
          where: { userId, chatId },
          defaults: {
            name: chatInfo.name,
            type: chatInfo.type,
            botIsAdmin: isAdmin,
            isActive: true
          }
        });

        if (!created) {
          // Update existing
          group.name = chatInfo.name;
          group.type = chatInfo.type;
          group.botIsAdmin = isAdmin;
          group.isActive = true;
          await group.save();
        }

        if (isAdmin) {
          synced.push({
            id: group.id,
            chatId: group.chatId,
            name: group.name,
            type: group.type
          });
        }
      } catch (error) {
        console.error(`[Telegram Sync] Error checking admin status for ${chatId}:`, error.message);
      }
    }

    console.log(`[Telegram Sync] Completed. Found ${synced.length} groups/channels where bot is admin`);

    res.json({
      success: true,
      message: `Synced ${synced.length} groups/channels`,
      groups: synced
    });
  } catch (error) {
    console.error('[Telegram Sync] Error syncing groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync Telegram groups',
      error: error.message
    });
  }
});

// Get user's telegram groups/channels where bot is admin
router.get('/groups', requireAuth, async (req, res) => {
  try {
    const userId = req.userId;
    
    const groups = await TelegramGroup.findAll({
      where: {
        userId,
        isActive: true,
        botIsAdmin: true
      },
      order: [['name', 'ASC']]
    });

    res.json({
      success: true,
      groups: groups.map(g => ({
        id: g.id,
        chatId: g.chatId,
        name: g.name,
        type: g.type,
        botIsAdmin: g.botIsAdmin
      }))
    });
  } catch (error) {
    console.error('[Telegram Routes] Error fetching groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Telegram groups',
      error: error.message
    });
  }
});

module.exports = router;

