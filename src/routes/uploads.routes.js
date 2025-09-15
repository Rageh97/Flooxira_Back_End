const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { requireAuth } = require('../middleware/auth');

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '');
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

const router = Router();
router.use(requireAuth);
router.post('/', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'No file' });
  
  console.log('Upload request received:', {
    filename: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: file.path
  });
  
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Cloudinary not configured:', {
        cloud_name: !!process.env.CLOUDINARY_CLOUD_NAME,
        api_key: !!process.env.CLOUDINARY_API_KEY,
        api_secret: !!process.env.CLOUDINARY_API_SECRET
      });
      return res.status(500).json({ message: 'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET' });
    }
    
    console.log('Cloudinary config check passed');
    
    const isVideo = (file.mimetype || '').startsWith('video');
    const options = { resource_type: 'auto', folder: 'social-manage' };
    
    console.log('Upload options:', { isVideo, options });
    
    let result;
    if (isVideo) {
      console.log('Starting video upload to Cloudinary...');
      try {
        // For large videos, use regular upload with resource_type: 'video'
        result = await cloudinary.uploader.upload(file.path, { 
          ...options, 
          resource_type: 'video',
          eager: [{ format: 'mp4', quality: 'auto' }]
        });
        console.log('Video upload result:', result);
        console.log('Video upload result keys:', Object.keys(result));
        console.log('Video upload result type:', typeof result);
        console.log('Video upload result stringified:', JSON.stringify(result, null, 2));
      } catch (uploadError) {
        console.error('Video upload error:', uploadError);
        throw uploadError;
      }
    } else {
      console.log('Starting image upload to Cloudinary...');
      try {
        result = await cloudinary.uploader.upload(file.path, options);
        console.log('Image upload result:', result);
        console.log('Image upload result keys:', Object.keys(result));
        console.log('Image upload result type:', typeof result);
        console.log('Image upload result stringified:', JSON.stringify(result, null, 2));
      } catch (uploadError) {
        console.error('Image upload error:', uploadError);
        throw uploadError;
      }
    }
    
    // Clean up the temporary file
    try {
      fs.unlinkSync(file.path);
      console.log('Temporary file cleaned up');
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file:', cleanupError.message);
    }
    
    // Check if result is valid
    if (!result || typeof result !== 'object') {
      console.error('Invalid result from Cloudinary:', result);
      throw new Error('Invalid response from Cloudinary upload');
    }
    
    // Map the response using the correct properties from Cloudinary
    const response = { 
      url: result.secure_url || result.url || result.secureUrl || result.original_secure_url || result.original_url, 
      public_id: result.public_id || result.publicId || result.asset_id, 
      resource_type: result.resource_type || result.resourceType || 'auto' 
    };
    
    console.log('Mapped response:', response);
    console.log('Sending response:', response);
    
    // Validate that we have at least a URL
    if (!response.url) {
      console.error('No URL found in response. Available properties:', Object.keys(result));
      throw new Error('No URL returned from Cloudinary upload');
    }
    
    return res.json(response);
  } catch (e) {
    console.error('Upload error:', e);
    
    // Clean up the temporary file on error too
    try {
      if (file && file.path) fs.unlinkSync(file.path);
      console.log('Temporary file cleaned up on error');
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file on error:', cleanupError.message);
    }
    
    const msg = (e && e.message) ? e.message : String(e);
    return res.status(500).json({ message: 'Cloudinary upload failed', details: msg });
  }
});

module.exports = router;
