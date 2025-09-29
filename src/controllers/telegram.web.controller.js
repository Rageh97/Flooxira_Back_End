const tg = require('../services/telegramWebService');

async function start(req, res) {
  const userId = req.userId;
  const result = await tg.startSession(userId);
  res.json(result);
}

async function status(req, res) {
  const userId = req.userId;
  const result = await tg.getStatus(userId);
  res.json(result);
}

async function qr(req, res) {
  const userId = req.userId;
  const qrCode = await tg.getQRCode(userId);
  if (qrCode) return res.json({ success: true, qrCode });
  res.json({ success: false, message: 'No QR available' });
}

async function stop(req, res) {
  const userId = req.userId;
  const result = await tg.stopSession(userId);
  res.json(result);
}

async function send(req, res) {
  const userId = req.userId;
  const { to, message } = req.body || {};
  if (!to || !message) return res.status(400).json({ success: false, message: 'to and message required' });
  const result = await tg.sendMessage(userId, to, message);
  res.json(result);
}

async function groups(req, res) {
  const userId = req.userId;
  const result = await tg.listGroups(userId);
  res.json(result);
}

async function sendBulk(req, res) {
  const userId = req.userId;
  let { targets, message } = req.body || {};
  if (typeof targets === 'string') {
    try { const arr = JSON.parse(targets); if (Array.isArray(arr)) targets = arr; } catch { targets = String(targets).split(',').map(s => s.trim()).filter(Boolean); }
  }
  if (!Array.isArray(targets) || targets.length === 0 || !message) return res.status(400).json({ success: false, message: 'targets (array) and message required' });
  const result = await tg.sendToMultiple(userId, targets, message);
  res.json(result);
}

module.exports = { start, status, qr, stop, send, groups, sendBulk };

