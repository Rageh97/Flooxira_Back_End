const WhatsAppBusinessAccount = require('../models/whatsappBusinessAccount');

async function exchangeMetaCode(req, res) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ message: 'Missing code' });

    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;
    const redirectUri = process.env.WHATSAPP_REDIRECT_URI || `${process.env.API_URL || 'http://localhost:4000'}/auth/whatsapp/callback`;
    if (!appId || !appSecret) return res.status(500).json({ message: 'Meta credentials not configured' });

    // Exchange code for short-lived token
    const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`);
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) return res.status(400).json({ message: 'Token exchange failed', details: tokenData.error || tokenData });

    // Optionally exchange for long-lived token
    const llRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`);
    const llData = await llRes.json();
    const accessToken = llData.access_token || tokenData.access_token;

    // Get business accounts (if any) and WhatsApp phone numbers
    const meRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,businesses{id,name,owned_ad_accounts,owned_pages,owned_instagram_accounts,owned_whatsapp_business_accounts}&access_token=${accessToken}`);
    const meData = await meRes.json();

    // Get WhatsApp phone numbers via business accounts
    let phoneNumberId = null;
    let wabaId = null;
    try {
      const wabasRes = await fetch(`https://graph.facebook.com/v21.0/me/owned_whatsapp_business_accounts?access_token=${accessToken}`);
      const wabas = await wabasRes.json();
      const waba = wabas?.data?.[0];
      if (waba?.id) {
        wabaId = waba.id;
        const numbersRes = await fetch(`https://graph.facebook.com/v21.0/${waba.id}/phone_numbers?access_token=${accessToken}`);
        const numbers = await numbersRes.json();
        phoneNumberId = numbers?.data?.[0]?.id || null;
      }
    } catch {}

    if (!phoneNumberId) {
      // Try via user associated numbers
      const pnRes = await fetch(`https://graph.facebook.com/v21.0/me/phone_numbers?access_token=${accessToken}`);
      const pnData = await pnRes.json();
      phoneNumberId = pnData?.data?.[0]?.id || null;
    }

    // If still no phone number found, return the access token for manual configuration
    if (!phoneNumberId) {
      return res.json({ 
        success: true, 
        accessToken,
        requiresManualSetup: true,
        message: 'Please manually enter your Phone Number ID and WABA ID in Settings' 
      });
    }

    const [account, created] = await WhatsAppBusinessAccount.findOrCreate({
      where: { userId: req.userId },
      defaults: { userId: req.userId, phoneNumberId, wabaId: wabaId || null, accessToken, lastSyncAt: new Date() }
    });
    if (!created) {
      account.phoneNumberId = phoneNumberId;
      account.wabaId = wabaId || null;
      account.accessToken = accessToken;
      account.lastSyncAt = new Date();
      await account.save();
    }

    return res.json({ success: true, phoneNumberId, wabaId });
  } catch (e) {
    console.error('WhatsApp OAuth exchange error:', e);
    return res.status(500).json({ message: 'Failed to complete WhatsApp connection', error: e.message });
  }
}

module.exports = { exchangeMetaCode };


