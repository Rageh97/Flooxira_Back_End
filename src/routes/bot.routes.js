const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/bot.controller');

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
router.post('/data', ctrl.saveData);
router.get('/data', ctrl.listData);
router.post('/upload', upload.single('file'), ctrl.uploadExcel);

module.exports = router;


