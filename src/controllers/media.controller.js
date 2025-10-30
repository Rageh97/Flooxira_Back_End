const path = require('path');
const fs = require('fs');
const multer = require('multer');
const whatsappService = require('../services/whatsappService');
const { WhatsappChat } = require('../models/whatsappChat');

const uploadDir = path.join(process.cwd(), 'uploads', 'media');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `wa_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({ storage });

exports.mediaUploader = upload.single('file');

exports.sendMedia = async (req, res) => {
  try {
    const userId = req.user.id;
    const { to, caption } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: 'file is required' });
    if (!to) return res.status(400).json({ success: false, message: 'to is required' });

    const filePath = req.file.path;
    const buffer = fs.readFileSync(filePath);
    const filename = req.file.originalname || path.basename(filePath);
    const mimetype = req.file.mimetype || 'application/octet-stream';

    const ok = await whatsappService.sendMediaTo(userId, to, buffer, filename, mimetype, caption || '');
    if (!ok) return res.status(500).json({ success: false, message: 'Failed to send media' });

    // Save media message to database
    try {
      const contentType = mimetype.startsWith('image/') ? 'image' : 
                         mimetype.startsWith('video/') ? 'video' : 
                         mimetype.startsWith('audio/') ? 'audio' : 'document';
      
      await WhatsappChat.create({
        userId,
        contactNumber: to,
        messageType: 'outgoing',
        messageContent: caption || `[${contentType.toUpperCase()}]`,
        contentType,
        mediaUrl: `/uploads/media/${path.basename(filePath)}`,
        mediaFilename: filename,
        mediaMimetype: mimetype,
        timestamp: new Date()
      });
    } catch (dbError) {
      console.error('Failed to save media message to database:', dbError);
    }

    // Cleanup
    try { fs.unlinkSync(filePath); } catch (_) {}
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};


