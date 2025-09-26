const { KnowledgeBase } = require('../models/knowledgeBase');
const { User } = require('../models/user');
const Fuse = require('fuse.js');
const OpenAI = require('openai');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');
const whatsappService = require('../services/whatsappService');
const { WhatsappSchedule } = require('../models/whatsappSchedule');
const { Post } = require('../models/post');

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Global error handler for unhandled rejections (file locking issues)
// Remove all existing handlers first to prevent duplicates
process.removeAllListeners('unhandledRejection');
process.removeAllListeners('uncaughtException');

process.on('unhandledRejection', (reason, promise) => {
  // Suppress all file locking and LocalAuth errors
  if (reason && reason.message && (
    reason.message.includes('EBUSY') ||
    reason.message.includes('resource busy or locked') ||
    reason.message.includes('LocalAuth') ||
    reason.message.includes('chrome_debug.log') ||
    reason.message.includes('Cookies') ||
    reason.message.includes('unlink')
  )) {
    // Completely suppress these errors - don't log anything
    return;
  }
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  // Suppress all file locking and LocalAuth errors
  if (error && error.message && (
    error.message.includes('EBUSY') ||
    error.message.includes('resource busy or locked') ||
    error.message.includes('LocalAuth') ||
    error.message.includes('chrome_debug.log') ||
    error.message.includes('Cookies') ||
    error.message.includes('unlink')
  )) {
    // Completely suppress these errors - don't log anything
    return;
  }
  console.error('Uncaught Exception:', error);
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

async function startWhatsAppSession(req, res) {
  try {
    const userId = req.userId;
    const result = await whatsappService.startSession(userId);
    
    if (result.success) {
      res.json(result);
              } else {
      res.status(500).json(result);
    }
  } catch (error) {
    console.error('WhatsApp session start error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to start WhatsApp session',
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

async function getWhatsAppStatus(req, res) {
  try {
    const userId = req.userId;
    const result = await whatsappService.getStatus(userId);
    res.json(result);
  } catch (error) {
    console.error('Get WhatsApp status error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get WhatsApp status',
      error: error.message 
    });
  }
}

async function getQRCode(req, res) {
  try {
    const userId = req.userId;
    const qrCode = await whatsappService.getQRCode(userId);
    
    if (qrCode) {
      res.json({
        success: true,
        qrCode: qrCode,
        message: 'QR Code available'
      });
    } else {
      res.json({
        success: false,
        message: 'No QR Code available. Please start a new session.'
      });
    }
  } catch (error) {
    console.error('Get QR Code error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to get QR Code',
      error: error.message 
    });
  }
}

async function stopWhatsAppSession(req, res) {
  try {
    const userId = req.userId;
    const result = await whatsappService.stopSession(userId);
    res.json(result);
  } catch (error) {
    console.error('Stop WhatsApp session error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to stop WhatsApp session',
      error: error.message 
    });
  }
}

async function sendWhatsAppMessage(req, res) {
  try {
    const userId = req.userId;
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        message: 'Recipient and message are required'
      });
    }
    
    const result = await whatsappService.sendMessage(userId, to, message);
    
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
    console.error('Send WhatsApp message error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message',
      error: error.message 
    });
  }
}

async function listGroups(req, res) {
  try {
    const userId = req.userId;
    const result = await whatsappService.listGroups(userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list groups', error: error.message });
  }
}

async function sendToGroup(req, res) {
  try {
    const userId = req.userId;
    const { groupName, message } = req.body;
    if (!groupName || !message) return res.status(400).json({ success: false, message: 'groupName and message required' });
    const result = await whatsappService.sendToGroupByName(userId, groupName, message);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send to group', error: error.message });
  }
}

async function sendToGroupsBulk(req, res) {
  try {
    const userId = req.userId;
    const file = req.file;
  let { groupNames, message, scheduleAt } = req.body || {};
  if (typeof groupNames === 'string') {
    try {
      const parsed = JSON.parse(groupNames);
      if (Array.isArray(parsed)) groupNames = parsed;
    } catch {
      groupNames = String(groupNames).split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  if (!groupNames || !Array.isArray(groupNames) || groupNames.length === 0) {
    return res.status(400).json({ success: false, message: 'groupNames (array) required' });
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
    const t = scheduleAt ? new Date(scheduleAt).getTime() : 0;
    if (t && t > now) {
      const record = await WhatsappSchedule.create({
        userId,
        type: 'groups',
        payload: { groupNames, message },
        mediaPath: media ? await saveTempMedia(media.buffer, media.filename) : null,
        scheduledAt: new Date(t),
        status: 'pending'
      });
      try { if (file) fs.unlinkSync(file.path); } catch {}
      return res.json({ success: true, message: `Scheduled (#${record.id}) for ${new Date(t).toISOString()}` });
    }

    const result = await whatsappService.sendToMultipleGroups(userId, groupNames, message || '', media, undefined);
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
    const rows = await WhatsappSchedule.findAll({ where: { userId }, order: [['scheduledAt', 'ASC']] });
    res.json({ success: true, schedules: rows });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list schedules' });
  }
}

async function cancelSchedule(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const row = await WhatsappSchedule.findOne({ where: { id, userId } });
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
    const { scheduledAt, payload } = req.body || {};
    const row = await WhatsappSchedule.findOne({ where: { id, userId } });
    if (!row) return res.status(404).json({ success: false, message: 'Schedule not found' });
    if (row.status !== 'pending') return res.status(400).json({ success: false, message: 'Only pending schedules can be updated' });
    if (scheduledAt) row.scheduledAt = new Date(scheduledAt);
    if (payload && typeof payload === 'object') row.payload = payload;
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
    const row = await WhatsappSchedule.findOne({ where: { id, userId } });
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
    const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, 0, 23, 59, 59)); // last day

    // WhatsApp schedules
    const wa = await WhatsappSchedule.findAll({
      where: { userId, scheduledAt: { [sequelize.Op.between]: [start, end] } },
      order: [['scheduledAt', 'ASC']]
    });

    // Platform posts (scheduled)
    const posts = await Post.findAll({
      where: { userId, status: 'scheduled', scheduledAt: { [sequelize.Op.between]: [start, end] } },
      order: [['scheduledAt', 'ASC']]
    });

    res.json({
      success: true,
      month: m,
      year: y,
      whatsapp: wa,
      posts
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to list monthly schedules' });
  }
}

async function updateScheduledPost(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { scheduledAt, content, platforms, format } = req.body || {};
    const post = await Post.findOne({ where: { id, userId } });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (scheduledAt) post.scheduledAt = new Date(scheduledAt);
    if (typeof content === 'string') post.content = content;
    if (Array.isArray(platforms)) post.platforms = platforms;
    if (format) post.format = format;
    await post.save();
    res.json({ success: true, post });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update post' });
  }
}

async function deleteScheduledPost(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const post = await Post.findOne({ where: { id, userId } });
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    await post.destroy();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to delete post' });
  }
}

async function exportGroupMembers(req, res) {
  try {
    const userId = req.userId;
    const { groupName } = req.query;
    if (!groupName) return res.status(400).json({ success: false, message: 'groupName required' });
    const result = await whatsappService.exportGroupMembers(userId, String(groupName));
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to export group members', error: error.message });
  }
}

async function postStatus(req, res) {
  try {
    const userId = req.userId;
    const file = req.file;
    const { caption } = req.body || {};
    if (!file) return res.status(400).json({ success: false, message: 'image required' });
    const buffer = fs.readFileSync(file.path);
    const result = await whatsappService.postStatus(userId, buffer, file.originalname, caption);
    // cleanup
    try { fs.unlinkSync(file.path); } catch {}
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to post status', error: error.message });
  }
}

async function startCampaign(req, res) {
  try {
    const userId = req.userId;
    const files = req.files || {};
    const excelFile = Array.isArray(files?.file) ? files.file[0] : null;
    const mediaFile = Array.isArray(files?.media) ? files.media[0] : null;
    const { messageTemplate, throttleMs, scheduleAt, dailyCap, perNumberDelayMs } = req.body || {};
    if (!excelFile) return res.status(400).json({ success: false, message: 'Excel file required' });
    const wb = xlsx.readFile(excelFile.path);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(ws);

    const now = Date.now();
    const t = scheduleAt ? new Date(scheduleAt).getTime() : 0;
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
          const date = new Date(t);
          date.setDate(date.getDate() + dayOffset);
          await WhatsappSchedule.create({
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
        await WhatsappSchedule.create({
          userId,
          type: 'campaign',
          payload: { rows, messageTemplate, throttleMs: perDelay },
          mediaPath,
          scheduledAt: new Date(t),
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

    const result = await whatsappService.startCampaign(userId, rows, messageTemplate || '', perDelay, media);
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
    const { contactNumber, limit = 50, offset = 0 } = req.query;
    
    const result = await whatsappService.getChatHistory(userId, contactNumber, parseInt(limit), parseInt(offset));
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
    const result = await whatsappService.getChatContacts(userId);
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
    const result = await whatsappService.getBotStats(userId);
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

module.exports = {
  startWhatsAppSession,
  getWhatsAppStatus,
  getQRCode,
  stopWhatsAppSession,
  sendWhatsAppMessage,
  // groups/status/campaigns
  listGroups,
  sendToGroup,
  exportGroupMembers,
  postStatus,
  startCampaign,
  sendToGroupsBulk,
  listSchedules,
  cancelSchedule,
  listMonthlySchedules,
  updateSchedule,
  deleteSchedule,
  updateScheduledPost,
  deleteScheduledPost,
  getChatHistory,
  getChatContacts,
  getBotStats,
  uploadKnowledgeBase,
  getKnowledgeBase,
  deleteKnowledgeEntry,
  upload
};