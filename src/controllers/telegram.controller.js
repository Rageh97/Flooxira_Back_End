const { KnowledgeBase } = require('../models/knowledgeBase');
const { User } = require('../models/user');
const Fuse = require('fuse.js');
const OpenAI = require('openai');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const telegramService = require('../services/telegramService');
const { TelegramSchedule } = require('../models/telegramSchedule');
const { TelegramAccount } = require('../models/telegramAccount');
const { Post } = require('../models/post');
const { sequelize } = require('../sequelize');
const { Op } = require('sequelize');

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Multer configuration for Excel uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/knowledge';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `knowledge_${req.userId}_${Date.now()}.xlsx`);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx) are allowed'), false);
    }
  }
});

async function createTelegramBot(req, res) {
  try {
    const userId = req.userId;
    const { botToken } = req.body;
    
    if (!botToken) {
      return res.status(400).json({
        success: false,
        message: 'Bot token is required'
      });
    }
    
    const result = await telegramService.createBot(userId, botToken);
    res.json(result);
  } catch (error) {
    console.error('Create Telegram bot error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create Telegram bot',
      error: error.message 
    });
  }
}

async function getTelegramStatus(req, res) {
  try {
    const userId = req.userId;
    const result = await telegramService.getBotStatus(userId);
    res.json(result);
  } catch (error) {
    console.error('Get Telegram status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get Telegram status',
      error: error.message 
    });
  }
}

async function stopTelegramBot(req, res) {
  try {
    const userId = req.userId;
    const result = await telegramService.stopBot(userId);
    res.json(result);
  } catch (error) {
    console.error('Stop Telegram bot error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop Telegram bot',
      error: error.message 
    });
  }
}

async function sendTelegramMessage(req, res) {
  try {
    const userId = req.userId;
    const { chatId, message } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Chat ID and message are required'
      });
    }
    
    const result = await telegramService.sendMessage(userId, chatId, message);
    
    if (result) {
      res.json({
        success: true,
        message: 'Message sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send message'
      });
    }
  } catch (error) {
    console.error('Send Telegram message error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message',
      error: error.message 
    });
  }
}

async function uploadKnowledgeBase(req, res) {
  try {
    const userId = req.userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    // Read and parse Excel file
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel file is empty' });
    }

    // Clear existing knowledge base for this user
    await KnowledgeBase.destroy({ where: { userId } });

    // Process and save new entries
    const entries = [];
    for (const row of data) {
      // Support both 'keyword' and 'key' column names (case insensitive)
      const keyword = row.keyword || row.key || row.Keyword || row.Key;
      const answer = row.answer || row.Answer;

      if (keyword && answer) {
        entries.push({
          userId,
          keyword: keyword.toString().trim(),
          answer: answer.toString().trim(),
          isActive: true
        });
      }
    }

    if (entries.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid keyword-answer pairs found. Please ensure your Excel file has "keyword" (or "key") and "answer" columns.' 
      });
    }

    // Bulk create entries
    await KnowledgeBase.bulkCreate(entries);

    // Clean up uploaded file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      message: `Successfully uploaded ${entries.length} knowledge base entries`,
      count: entries.length
    });

  } catch (error) {
    console.error('Knowledge base upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to upload knowledge base',
      error: error.message 
    });
  }
}

async function getKnowledgeBase(req, res) {
  try {
    const userId = req.userId;
    const entries = await KnowledgeBase.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      entries: entries.map(entry => ({
        id: entry.id,
        keyword: entry.keyword,
        answer: entry.answer,
        isActive: entry.isActive,
        createdAt: entry.createdAt
      }))
    });

  } catch (error) {
    console.error('Get knowledge base error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get knowledge base',
      error: error.message 
    });
  }
}

async function deleteKnowledgeEntry(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const entry = await KnowledgeBase.findOne({
      where: { id, userId }
    });

    if (!entry) {
      return res.status(404).json({ 
        success: false, 
        message: 'Knowledge base entry not found' 
      });
    }

    await entry.destroy();

    res.json({
      success: true,
      message: 'Knowledge base entry deleted successfully'
    });

  } catch (error) {
    console.error('Delete knowledge entry error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete knowledge base entry',
      error: error.message 
    });
  }
}

async function listGroups(req, res) {
  try {
    const userId = req.userId;
    const result = await telegramService.listGroups(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list groups', error: error.message });
  }
}

async function sendToGroup(req, res) {
  try {
    const userId = req.userId;
    const { groupId, message } = req.body;
    if (!groupId || !message) return res.status(400).json({ success: false, message: 'groupId and message required' });
    const result = await telegramService.sendToGroup(userId, groupId, message);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send to group', error: error.message });
  }
}

async function sendToGroupsBulk(req, res) {
  try {
    const userId = req.userId;
    const file = req.file;
    let { groupIds, message, scheduleAt, timezoneOffset } = req.body || {};
    
    if (typeof groupIds === 'string') {
      try {
        const parsed = JSON.parse(groupIds);
        if (Array.isArray(parsed)) groupIds = parsed;
      } catch {
        groupIds = String(groupIds).split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    
    if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ success: false, message: 'groupIds (array) required' });
    }
    
    if (!message && !file) {
      return res.status(400).json({ success: false, message: 'message or media required' });
    }

    let media = null;
    if (file) {
      const buffer = fs.readFileSync(file.path);
      media = { buffer, filename: file.originalname, mimetype: file.mimetype };
    }

    // If scheduleAt future => persist schedule
    const now = Date.now();
    let scheduledDate = null;
    if (scheduleAt) {
      // Parse the datetime-local string with timezone offset
      const [datePart, timePart] = scheduleAt.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      // Get user's timezone offset (in minutes)
      const userTimezoneOffset = timezoneOffset ? parseInt(timezoneOffset) : 0;
      const serverTimezoneOffset = new Date().getTimezoneOffset();
      
      // Calculate the difference between user and server timezone
      const timezoneDifference = userTimezoneOffset - serverTimezoneOffset;
      
      // Create the date in user's timezone, then adjust for server timezone
      scheduledDate = new Date(year, month - 1, day, hours, minutes);
      
      // Adjust for timezone difference
      if (timezoneDifference !== 0) {
        scheduledDate = new Date(scheduledDate.getTime() + (timezoneDifference * 60 * 1000));
      }
    }
    
    const t = scheduledDate ? scheduledDate.getTime() : 0;
    if (t && t > now) {
      const record = await TelegramSchedule.create({
        userId,
        type: 'message',
        payload: { groupIds, message },
        mediaPath: media ? await saveTempMedia(media.buffer, media.filename) : null,
        scheduledAt: scheduledDate,
        status: 'pending'
      });
      try { if (file) fs.unlinkSync(file.path); } catch {}
      return res.json({ success: true, message: `Scheduled (#${record.id}) for ${new Date(t).toISOString()}` });
    }

    const result = await telegramService.sendToMultipleGroups(userId, groupIds, message || '', media, undefined);
    try { if (file) fs.unlinkSync(file.path); } catch {}
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send to groups', error: error.message });
  }
}

async function saveTempMedia(buffer, filename) {
  const dir = 'uploads/schedules';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const p = `${dir}/${Date.now()}_${filename || 'file'}`;
  fs.writeFileSync(p, buffer);
  return p;
}

async function listSchedules(req, res) {
  try {
    const userId = req.userId;
    const rows = await TelegramSchedule.findAll({ where: { userId }, order: [['scheduledAt', 'ASC']] });
    res.json({ success: true, schedules: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list schedules' });
  }
}

async function cancelSchedule(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const row = await TelegramSchedule.findOne({ where: { id, userId } });
    if (!row) return res.status(404).json({ success: false, message: 'Schedule not found' });
    if (row.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending schedules can be cancelled' });
    row.status = 'cancelled';
    await row.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to cancel schedule' });
  }
}

async function updateSchedule(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { scheduledAt, payload, timezoneOffset } = req.body || {};
    const mediaFile = req.file;
    const row = await TelegramSchedule.findOne({ where: { id, userId } });
    if (!row) return res.status(404).json({ success: false, message: 'Schedule not found' });
    if (row.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending schedules can be updated' });
    
    if (scheduledAt) {
      // Parse datetime-local string with timezone offset
      if (scheduledAt.includes('T')) {
        const [datePart, timePart] = scheduledAt.split('T');
        const [year, month, day] = datePart.split('-').map(Number);
        const [hours, minutes] = timePart.split(':').map(Number);
        
        // Get user's timezone offset (in minutes)
        const userTimezoneOffset = timezoneOffset ? parseInt(timezoneOffset) : 0;
        const serverTimezoneOffset = new Date().getTimezoneOffset();
        
        // Calculate the difference between user and server timezone
        const timezoneDifference = userTimezoneOffset - serverTimezoneOffset;
        
        // Create the date in user's timezone, then adjust for server timezone
        let newScheduledDate = new Date(year, month - 1, day, hours, minutes);
        
        // Adjust for timezone difference
        if (timezoneDifference !== 0) {
          newScheduledDate = new Date(newScheduledDate.getTime() + (timezoneDifference * 60 * 1000));
        }
        
        row.scheduledAt = newScheduledDate;
      } else {
        row.scheduledAt = new Date(scheduledAt);
      }
    }
    
    if (payload && typeof payload === 'object') row.payload = payload;
    
    // Handle media file update
    if (mediaFile) {
      try {
        // Delete old media file if it exists
        if (row.mediaPath) {
          try {
            fs.unlinkSync(row.mediaPath);
          } catch (e) {
            console.log('Could not delete old media file:', e.message);
          }
        }
        
        // Save new media file
        const buffer = fs.readFileSync(mediaFile.path);
        row.mediaPath = await saveTempMedia(buffer, mediaFile.originalname);
        
        // Clean up temp file
        try {
          fs.unlinkSync(mediaFile.path);
        } catch (e) {
          console.log('Could not delete temp file:', e.message);
        }
      } catch (error) {
        console.error('Failed to update media:', error);
        return res.status(500).json({ success: false, message: 'Failed to update media file' });
      }
    }
    
    await row.save();
    res.json({ success: true, schedule: row });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update schedule' });
  }
}

async function deleteSchedule(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const row = await TelegramSchedule.findOne({ where: { id, userId } });
    if (!row) return res.status(404).json({ success: false, message: 'Schedule not found' });
    if (row.status === 'running') return res.status(400).json({ success: false, message: 'Cannot delete running schedule' });
    await row.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete schedule' });
  }
}

async function listMonthlySchedules(req, res) {
  try {
    const userId = req.userId;
    const { month, year } = req.query;
    const y = parseInt(year || new Date().getFullYear());
    const m = parseInt(month || (new Date().getMonth() + 1)); // 1-based
    
    // Use local timezone instead of UTC to avoid timezone issues
    const start = new Date(y, m - 1, 1, 0, 0, 0);
    const end = new Date(y, m, 0, 23, 59, 59); // last day

    // Telegram schedules
    const tg = await TelegramSchedule.findAll({
      where: { 
        userId, 
        scheduledAt: { 
          [Op.gte]: start,
          [Op.lte]: end
        } 
      },
      order: [['scheduledAt', 'ASC']]
    });

    // Platform posts (scheduled)
    const posts = await Post.findAll({
      where: { 
        userId, 
        status: 'scheduled', 
        scheduledAt: { 
          [Op.gte]: start,
          [Op.lte]: end
        } 
      },
      order: [['scheduledAt', 'ASC']]
    });

    res.json({
      success: true,
      month: m,
      year: y,
      telegram: tg,
      posts
    });
  } catch (e) {
    console.error('[Monthly Schedules] Error:', e);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to list monthly schedules',
      error: e.message 
    });
  }
}

async function startCampaign(req, res) {
  try {
    const userId = req.userId;
    const files = req.files || {};
    const excelFile = Array.isArray(files?.file) ? files.file[0] : null;
    const mediaFile = Array.isArray(files?.media) ? files.media[0] : null;
    const { messageTemplate, throttleMs, scheduleAt, dailyCap, perNumberDelayMs, timezoneOffset } = req.body || {};
    
    if (!excelFile) return res.status(400).json({ success: false, message: 'Excel file required' });
    
    const wb = xlsx.readFile(excelFile.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws);

    const now = Date.now();
    let scheduledDate = null;
    if (scheduleAt) {
      // Parse the datetime-local string with timezone offset
      const [datePart, timePart] = scheduleAt.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      // Get user's timezone offset (in minutes)
      const userTimezoneOffset = timezoneOffset ? parseInt(timezoneOffset) : 0;
      const serverTimezoneOffset = new Date().getTimezoneOffset();
      
      // Calculate the difference between user and server timezone
      const timezoneDifference = userTimezoneOffset - serverTimezoneOffset;
      
      // Create the date in user's timezone, then adjust for server timezone
      scheduledDate = new Date(year, month - 1, day, hours, minutes);
      
      // Adjust for timezone difference
      if (timezoneDifference !== 0) {
        scheduledDate = new Date(scheduledDate.getTime() + (timezoneDifference * 60 * 1000));
      }
    }
    
    const t = scheduledDate ? scheduledDate.getTime() : 0;
    const cap = dailyCap ? parseInt(String(dailyCap)) : 0;
    const perDelay = perNumberDelayMs ? parseInt(String(perNumberDelayMs)) : parseInt(throttleMs || '3000');
    
    if (t && t > now) {
      const mediaPath = mediaFile ? await saveTempMedia(fs.readFileSync(mediaFile.path), mediaFile.originalname) : null;
      if (cap && cap > 0 && rows.length > cap) {
        // Split into multiple daily schedules
        let idx = 0;
        let dayOffset = 0;
        while (idx < rows.length) {
          const slice = rows.slice(idx, idx + cap);
          const date = new Date(scheduledDate);
          date.setDate(date.getDate() + dayOffset);
          await TelegramSchedule.create({
            userId,
            type: 'campaign',
            payload: { rows: slice, messageTemplate, throttleMs: perDelay },
            mediaPath,
            scheduledAt: date,
            status: 'pending'
          });
          idx += cap;
          dayOffset += 1;
        }
      } else {
        await TelegramSchedule.create({
          userId,
          type: 'campaign',
          payload: { rows, messageTemplate, throttleMs: perDelay },
          mediaPath,
          scheduledAt: scheduledDate,
          status: 'pending'
        });
      }
      try { if (excelFile) fs.unlinkSync(excelFile.path); } catch {}
      try { if (mediaFile) fs.unlinkSync(mediaFile.path); } catch {}
      return res.json({ success: true, message: `Campaign scheduled for ${new Date(t).toISOString()}` });
    }

    let media = null;
    if (mediaFile) {
      const buffer = fs.readFileSync(mediaFile.path);
      media = { buffer, filename: mediaFile.originalname, mimetype: mediaFile.mimetype };
    }

    const result = await telegramService.startCampaign(userId, rows, messageTemplate || '', perDelay, media);
    try { if (excelFile) fs.unlinkSync(excelFile.path); } catch {}
    try { if (mediaFile) fs.unlinkSync(mediaFile.path); } catch {}
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to start campaign', error: error.message });
  }
}

async function getChatHistory(req, res) {
  try {
    const userId = req.userId;
    const { chatId, limit = 50, offset = 0 } = req.query;
    
    const result = await telegramService.getChatHistory(userId, chatId, parseInt(limit), parseInt(offset));
    res.json(result);
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get chat history',
      error: error.message 
    });
  }
}

async function getChatContacts(req, res) {
  try {
    const userId = req.userId;
    const result = await telegramService.getChatContacts(userId);
    res.json(result);
  } catch (error) {
    console.error('Get chat contacts error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get chat contacts',
      error: error.message 
    });
  }
}

async function getBotStats(req, res) {
  try {
    const userId = req.userId;
    const result = await telegramService.getBotStats(userId);
    res.json(result);
  } catch (error) {
    console.error('Get bot stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get bot stats',
      error: error.message 
    });
  }
}

async function getBotInfo(req, res) {
  try {
    const userId = req.userId;
    const result = await telegramService.getBotInfo(userId);
    res.json(result);
  } catch (error) {
    console.error('Get bot info error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get bot info',
      error: error.message 
    });
  }
}

module.exports = {
  createTelegramBot,
  getTelegramStatus,
  stopTelegramBot,
  sendTelegramMessage,
  // groups/campaigns
  listGroups,
  sendToGroup,
  sendToGroupsBulk,
  startCampaign,
  listSchedules,
  cancelSchedule,
  listMonthlySchedules,
  updateSchedule,
  deleteSchedule,
  getChatHistory,
  getChatContacts,
  getBotStats,
  getBotInfo,
  uploadKnowledgeBase,
  getKnowledgeBase,
  deleteKnowledgeEntry,
  upload
};