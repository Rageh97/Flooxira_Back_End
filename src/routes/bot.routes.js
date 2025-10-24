const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/bot.controller');
const { searchOrAnswer } = require('../services/botSearchService');

const uploadDir = path.join(process.cwd(), 'uploads', 'bot');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${Date.now()}_${base}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth);

router.post('/fields', ctrl.addField);
router.get('/fields', ctrl.listFields);
router.delete('/fields/:id', ctrl.deleteField);
router.post('/data', ctrl.saveData);
router.get('/data', ctrl.listData);
router.put('/data/:id', ctrl.updateData);
router.delete('/data/:id', ctrl.deleteData);
router.post('/upload', upload.single('file'), ctrl.uploadExcel);
router.get('/export', ctrl.exportData);

// List available Gemini models for the provided GOOGLE_API_KEY
router.get('/llm/models', async (req, res) => {
  try {
    if (!process.env.GOOGLE_API_KEY) return res.status(400).json({ ok: false, message: 'GOOGLE_API_KEY not set' });
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ ok: false, error: text });
    }
    const data = await resp.json();
    const models = Array.isArray(data.models) ? data.models.map((m) => ({ name: m.name, displayName: m.displayName, description: m.description })) : [];
    return res.json({ ok: true, models });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
});

// Debug endpoint to test search without OpenAI requirement
router.get('/test-search', async (req, res) => {
  try {
    const userId = req.userId;
    const q = String(req.query.q || '');
    if (!q) return res.status(400).json({ message: 'q required' });
    const result = await searchOrAnswer(userId, q, 0.5, 5);
    return res.json({ ok: true, result });
  } catch (e) {
    return res.status(500).json({ ok: false, message: e?.message || String(e) });
  }
});

module.exports = router;


