const WhatsAppBusinessAccount = require('../models/whatsappBusinessAccount');
const { KnowledgeBase } = require('../models/knowledgeBase');
const Fuse = require('fuse.js');
const multer = require('multer');
const xlsx = require('xlsx');
const fs = require('fs');

async function configure(req, res) {
  try {
    const { phoneNumberId, accessToken, wabaId, phoneNumber, verifyToken } = req.body;
    if (!phoneNumberId || !accessToken) {
      return res.status(400).json({ message: 'phoneNumberId and accessToken are required' });
    }
    const [account, created] = await WhatsAppBusinessAccount.findOrCreate({
      where: { userId: req.userId },
      defaults: { userId: req.userId, phoneNumberId, accessToken, wabaId: wabaId || null, phoneNumber: phoneNumber || null, verifyToken: verifyToken || null, lastSyncAt: new Date() }
    });
    if (!created) {
      account.phoneNumberId = phoneNumberId;
      account.accessToken = accessToken;
      account.wabaId = wabaId || null;
      account.phoneNumber = phoneNumber || null;
      account.verifyToken = verifyToken || null;
      account.lastSyncAt = new Date();
      await account.save();
    }
    return res.json({ success: true });
  } catch (e) {
    console.error('WABA configure error:', e);
    return res.status(500).json({ message: 'Failed to configure WhatsApp Business', error: e.message });
  }
}

async function status(req, res) {
  try {
    const account = await WhatsAppBusinessAccount.findOne({ where: { userId: req.userId } });
    if (!account) return res.status(404).json({ message: 'Not configured' });
    return res.json({
      phoneNumberId: account.phoneNumberId,
      phoneNumber: account.phoneNumber,
      wabaId: account.wabaId,
      isActive: account.isActive,
      lastSyncAt: account.lastSyncAt
    });
  } catch (e) {
    console.error('WABA status error:', e);
    return res.status(500).json({ message: 'Failed to get status' });
  }
}

function formatPhoneNumber(phoneNumber) {
  // Remove all non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, '');
  
  // If it starts with 1 and is 11 digits, it's US number
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return cleaned;
  }
  
  // If it's 10 digits, assume US and add 1
  if (cleaned.length === 10) {
    return '1' + cleaned;
  }
  
  // If it already has country code, return as is
  if (cleaned.length > 10) {
    return cleaned;
  }
  
  // Default: return as is (might fail, but let WhatsApp API handle it)
  return cleaned;
}

async function sendMessage(req, res) {
  try {
    const { to, text } = req.body;
    if (!to || !text) return res.status(400).json({ message: 'to and text are required' });
    
    const account = await WhatsAppBusinessAccount.findOne({ where: { userId: req.userId } });
    if (!account) return res.status(400).json({ message: 'WhatsApp not configured' });
    
    const formattedPhone = formatPhoneNumber(to);
    console.log('Sending WhatsApp message:', { original: to, formatted: formattedPhone, text: text.substring(0, 50) });
    
    const token = account.accessToken;
    const url = `https://graph.facebook.com/v21.0/${account.phoneNumberId}/messages`;
    
    // Try free-form message first
    let resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: { 
          body: text,
          preview_url: false
        }
      })
    });
    
    let data = await resp.json();
    console.log('WhatsApp API response:', { status: resp.status, data });
    
    // If free-form fails, try with a simple template
    if (!resp.ok && data.error?.code === 131026) {
      console.log('Free-form message failed, trying template...');
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedPhone,
          type: 'template',
          template: {
            name: 'hello_world',
            language: { code: 'en_US' }
          }
        })
      });
      data = await resp.json();
      console.log('Template message response:', { status: resp.status, data });
    }
    
    if (!resp.ok) {
      return res.status(resp.status).json({ 
        message: 'Send failed', 
        details: data,
        formattedPhone: formattedPhone,
        note: 'WhatsApp requires message templates for new conversations. Have the recipient message you first, or use approved templates.'
      });
    }
    return res.json({ success: true, data });
  } catch (e) {
    console.error('WABA send error:', e);
    return res.status(500).json({ message: 'Failed to send message', error: e.message });
  }
}

async function webhookVerify(req, res) {
  try {
    const account = await WhatsAppBusinessAccount.findOne({ where: { userId: req.query.userId } });
    const verifyToken = account?.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === verifyToken) {
      return res.status(200).send(challenge);
    } else {
      return res.sendStatus(403);
    }
  } catch {
    return res.sendStatus(403);
  }
}

async function webhookReceive(req, res) {
  try {
    const body = req.body;
    res.sendStatus(200);
    if (!body || !body.entry) return;
    for (const entry of body.entry) {
      for (const change of (entry.changes || [])) {
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const messages = value.messages || [];
        if (!phoneNumberId || messages.length === 0) continue;
        const account = await WhatsAppBusinessAccount.findOne({ where: { phoneNumberId } });
        if (!account) continue;
        const token = account.accessToken;
        for (const msg of messages) {
          if (msg.type !== 'text') continue;
          const userId = account.userId;
          const text = msg.text?.body || '';
          if (!text.trim()) continue;
          const kb = await KnowledgeBase.findAll({ where: { userId, isActive: true } });
          let reply = '';
          if (kb.length > 0) {
            const fuse = new Fuse(kb, { keys: ['keyword'], threshold: 0.5, includeScore: true });
            const results = fuse.search(text);
            if (results.length > 0 && results[0].score < 0.6) {
              reply = results[0].item.answer;
            }
          }
          if (!reply) reply = 'Hello! How can I help you today?';
          const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
          try {
            await fetch(url, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: msg.from,
                type: 'text',
                text: { body: reply }
              })
            });
          } catch {}
        }
      }
    }
  } catch (e) {
    res.sendStatus(200);
  }
}

// ===== Knowledge base (Excel) management =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/knowledge';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `knowledge_${req.userId}_${Date.now()}.xlsx`)
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') cb(null, true);
    else cb(new Error('Only .xlsx files are allowed'), false);
  }
});

async function uploadKnowledgeBase(req, res) {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });
    const workbook = xlsx.readFile(file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet);
    await KnowledgeBase.destroy({ where: { userId: req.userId } });
    const entries = [];
    for (const row of rows) {
      const keyword = row.keyword || row.key || row.Keyword || row.Key;
      const answer = row.answer || row.Answer;
      if (keyword && answer) {
        entries.push({ userId: req.userId, keyword: String(keyword).trim(), answer: String(answer).trim(), isActive: true });
      }
    }
    if (entries.length === 0) return res.status(400).json({ message: 'No valid rows found' });
    await KnowledgeBase.bulkCreate(entries);
    fs.unlinkSync(file.path);
    return res.json({ success: true, count: entries.length });
  } catch (e) {
    return res.status(500).json({ message: 'Failed to upload knowledge base', error: e.message });
  }
}

async function getKnowledgeBase(req, res) {
  const entries = await KnowledgeBase.findAll({ where: { userId: req.userId }, order: [['createdAt', 'DESC']] });
  return res.json({ entries: entries.map(e => ({ id: e.id, keyword: e.keyword, answer: e.answer, isActive: e.isActive, createdAt: e.createdAt })) });
}

async function deleteKnowledgeEntry(req, res) {
  const { id } = req.params;
  const entry = await KnowledgeBase.findOne({ where: { id, userId: req.userId } });
  if (!entry) return res.status(404).json({ message: 'Not found' });
  await entry.destroy();
  return res.json({ success: true });
}

module.exports = {
  configure,
  status,
  sendMessage,
  webhookVerify,
  webhookReceive,
  upload,
  uploadKnowledgeBase,
  getKnowledgeBase,
  deleteKnowledgeEntry
};


