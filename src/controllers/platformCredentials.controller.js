const PlatformCredential = require('../models/platformCredential');

async function listCredentials(req, res) {
  try {
    const rows = await PlatformCredential.findAll({ where: { userId: req.user.id }, order: [['platform', 'ASC']] });
    return res.json({ success: true, credentials: rows.map(r => ({ id: r.id, platform: r.platform, clientId: r.clientId, redirectUri: r.redirectUri, metadata: r.metadata })) });
  } catch (e) {
    console.error('Error listing platform credentials:', e);
    return res.status(500).json({ success: false, message: 'Failed to list credentials', error: e.message });
  }
}

async function getCredential(req, res) {
  try {
    const { platform } = req.params;
    const row = await PlatformCredential.findOne({ where: { userId: req.user.id, platform } });
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, credential: { id: row.id, platform: row.platform, clientId: row.clientId, redirectUri: row.redirectUri, metadata: row.metadata } });
  } catch (e) {
    console.error('Error getting platform credential:', e);
    return res.status(500).json({ success: false, message: 'Failed to get credential', error: e.message });
  }
}

async function upsertCredential(req, res) {
  try {
    const { platform } = req.params;
    const { clientId, clientSecret, redirectUri, metadata } = req.body || {};
    if (!clientId || !clientSecret) return res.status(400).json({ success: false, message: 'clientId and clientSecret are required' });
    const [row, created] = await PlatformCredential.findOrCreate({
      where: { userId: req.user.id, platform },
      defaults: { userId: req.user.id, platform, clientId, clientSecret, redirectUri: redirectUri || null, metadata: metadata || {} }
    });
    if (!created) {
      row.clientId = clientId;
      row.clientSecret = clientSecret;
      row.redirectUri = redirectUri || null;
      if (metadata) row.metadata = metadata;
      await row.save();
    }
    return res.json({ success: true });
  } catch (e) {
    console.error('Error saving platform credential:', e);
    return res.status(500).json({ success: false, message: 'Failed to save credential', error: e.message });
  }
}

async function deleteCredential(req, res) {
  try {
    const { platform } = req.params;
    const row = await PlatformCredential.findOne({ where: { userId: req.user.id, platform } });
    if (!row) return res.status(404).json({ success: false, message: 'Not found' });
    await row.destroy();
    return res.json({ success: true });
  } catch (e) {
    console.error('Error deleting platform credential:', e);
    return res.status(500).json({ success: false, message: 'Failed to delete credential', error: e.message });
  }
}

module.exports = { listCredentials, getCredential, upsertCredential, deleteCredential };








