const telegramPersonal = require('../services/telegramPersonalService');
const multer = require('multer');
const upload = multer({ dest: 'uploads/tmp' });

async function start(req, res) {
  const userId = req.userId;
  const result = await telegramPersonal.startSession(userId);
  res.json(result);
}

async function status(req, res) {
  const userId = req.userId;
  const result = await telegramPersonal.getStatus(userId);
  res.json(result);
}

async function qr(req, res) {
  const userId = req.userId;
  const qrCode = await telegramPersonal.getQRCode(userId);
  if (qrCode) return res.json({ success: true, qrCode });
  res.json({ success: false, message: 'No QR available' });
}

async function stop(req, res) {
  const userId = req.userId;
  const result = await telegramPersonal.stopSession(userId);
  res.json(result);
}

async function send(req, res) {
  const userId = req.userId;
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ success: false, message: 'to and message required' });
  const ok = await telegramPersonal.sendMessage(userId, to, message);
  res.json(ok ? { success: true } : { success: false, message: 'send failed' });
}

async function chats(req, res) {
  const userId = req.userId;
  const { chatId, limit = 50, offset = 0 } = req.query || {};
  const result = await telegramPersonal.getChatHistory(userId, chatId, parseInt(limit), parseInt(offset));
  res.json(result);
}

async function contacts(req, res) {
  const userId = req.userId;
  const result = await telegramPersonal.getChatContacts(userId);
  res.json(result);
}

async function stats(req, res) {
  const userId = req.userId;
  const result = await telegramPersonal.getBotStats(userId);
  res.json(result);
}

async function groups(req, res) {
  const userId = req.userId;
  const result = await telegramPersonal.listGroups(userId);
  res.json(result);
}

module.exports = { start, status, qr, stop, send, chats, contacts, stats, groups, upload };

