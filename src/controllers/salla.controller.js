const crypto = require('crypto');
const { SallaEvent } = require('../models/sallaEvent');
const { SallaStore } = require('../models/sallaStore');
const { User } = require('../models/user');

function timingSafeEqual(a, b) {
  try {
    const bufA = Buffer.from(String(a || ''), 'utf8');
    const bufB = Buffer.from(String(b || ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function handleWebhook(req, res) {
  try {
    const { user_id } = req.params || {};
    const signatureHeader = req.headers['x-salla-signature'] || req.headers['x-salla-signature-hmac'] || req.headers['x-signature'] || '';

    // Raw body for HMAC
    const rawBody = req.rawBody || JSON.stringify(req.body || {});
    const payload = req.body || {};
    const eventType = payload?.event || payload?.type || payload?.data?.type || 'unknown';
    const storeId = payload?.data?.store?.id || payload?.store_id || payload?.storeId || null;

    // Resolve user by path param or by store mapping
    let userId = Number(user_id) || null;
    let sallaStore = null;
    if (storeId) {
      sallaStore = await SallaStore.findOne({ where: { storeId: String(storeId) } });
      if (sallaStore && !userId) userId = sallaStore.userId;
    }

    // Compute expected HMAC if secret available
    let signatureValid = false;
    let expectedSig = '';
    const secret = sallaStore?.webhookSecret || process.env.SALLA_WEBHOOK_SECRET || '';
    if (secret) {
      expectedSig = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
      signatureValid = timingSafeEqual(signatureHeader, expectedSig);
    } else {
      // If no secret configured, accept but mark invalid
      signatureValid = false;
    }

    // Log
    console.log('[Salla] Webhook received', { eventType, storeId, userId, signatureHeader, signatureValid });

    // Store event
    const evt = await SallaEvent.create({
      userId: userId || null,
      storeId: storeId ? String(storeId) : null,
      sallaStoreId: sallaStore?.id || null,
      eventType: String(eventType),
      payload: payload,
      signatureValid,
      receivedAt: new Date()
    });

    // Respond 200 always (or 401 if signature invalid and secret exists)
    if (secret && !signatureValid) {
      return res.status(401).json({ ok: false, message: 'Invalid signature', id: evt.id });
    }
    return res.status(200).json({ ok: true, id: evt.id });
  } catch (e) {
    console.error('Salla webhook error', e);
    return res.status(200).json({ ok: true });
  }
}

async function upsertStore(req, res) {
  try {
    const userId = req.user?.id || req.userId;
    const { storeId, storeName, webhookSecret } = req.body || {};
    if (!storeId) return res.status(400).json({ message: 'storeId is required' });
    const [store] = await SallaStore.findOrCreate({ where: { storeId: String(storeId) }, defaults: { userId, storeName: storeName || null, webhookSecret: webhookSecret || null } });
    if (store.userId !== userId) {
      store.userId = userId;
    }
    if (typeof storeName !== 'undefined') store.storeName = storeName;
    if (typeof webhookSecret !== 'undefined') store.webhookSecret = webhookSecret;
    await store.save();
    return res.json({ ok: true, store });
  } catch (e) {
    console.error('Salla upsertStore error', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}

async function listEvents(req, res) {
  try {
    const userId = req.user?.id || req.userId;
    const { limit = 50, offset = 0 } = req.query || {};
    const events = await SallaEvent.findAll({
      where: { userId },
      order: [['id', 'DESC']],
      limit: Math.min(Number(limit) || 50, 200),
      offset: Number(offset) || 0
    });
    return res.json({ success: true, events });
  } catch (e) {
    console.error('Salla listEvents error', e);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
}

module.exports = { handleWebhook, upsertStore, listEvents };


