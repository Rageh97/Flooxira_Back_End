const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');

class TelegramService {
  constructor() {
    this.userClients = new Map(); // userId -> TelegramClient
    this.userStates = new Map(); // userId -> { phoneCodeHash, phoneNumber }
  }

  getSessionDir() {
    const dir = path.join(process.cwd(), 'back-end', 'data', 'tg-sessions');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    return dir;
  }

  getSessionPath(userId) {
    return path.join(this.getSessionDir(), `user_${userId}.session`);
  }

  loadStringSession(userId) {
    const p = this.getSessionPath(userId);
    try {
      const s = fs.readFileSync(p, 'utf8');
      if (s && typeof s === 'string') return new StringSession(s.trim());
    } catch {}
    return new StringSession('');
  }

  saveStringSession(userId, client) {
    try {
      const p = this.getSessionPath(userId);
      fs.writeFileSync(p, client.session.save(), 'utf8');
    } catch {}
  }

  async ensureClient(userId) {
    if (this.userClients.has(userId)) return this.userClients.get(userId);
    const apiId = Number(process.env.TELEGRAM_API_ID || 0);
    const apiHash = process.env.TELEGRAM_API_HASH || '';
    if (!apiId || !apiHash) {
      throw new Error('Missing TELEGRAM_API_ID/TELEGRAM_API_HASH');
    }
    const session = this.loadStringSession(userId);
    const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
    this.userClients.set(userId, client);
    return client;
  }

  async connectIfNeeded(userId) {
    const client = await this.ensureClient(userId);
    if (!client.connected) {
      await client.connect();
    }
    return client;
  }

  async startSession(userId, opts = {}) {
    try {
      const client = await this.connectIfNeeded(userId);
      // If already authorized, just return connected
      const isAuthorized = await client.checkAuthorization();
      if (isAuthorized) {
        return { success: true, status: 'CONNECTED', message: 'Already authorized' };
      }

      const method = (opts.method || 'code').toLowerCase();

      if (method === 'qr') {
        // QR login via ExportLoginToken
        const apiId = Number(process.env.TELEGRAM_API_ID || 0);
        const apiHash = process.env.TELEGRAM_API_HASH || '';
        const token = await client.invoke(new Api.auth.ExportLoginToken({ apiId, apiHash, exceptIds: [] }));
        if (token instanceof Api.auth.LoginToken) {
          const buf = token.token;
          const base64 = Buffer.from(buf).toString('base64');
          const tgUrl = `tg://login?token=${base64}`;
          const webUrl = `https://t.me/login?token=${base64}`;
          const dataUrl = await QRCode.toDataURL(webUrl);
          // Caller should poll /status to see when connected
          return { success: true, status: 'QR_READY', qrCode: dataUrl, tgUrl, webUrl };
        }
        // Migration cases are edge; ask to retry
        return { success: false, status: 'ERROR', message: 'QR login redirect required, retry' };
      }

      // Default: code login
      const phoneNumber = String(opts.phone || '').trim();
      if (!phoneNumber) {
        return { success: true, status: 'PHONE_REQUIRED', message: 'Provide phone to begin login' };
      }
      const sent = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber,
          apiId: Number(process.env.TELEGRAM_API_ID),
          apiHash: process.env.TELEGRAM_API_HASH,
          settings: new Api.CodeSettings({})
        })
      );
      this.userStates.set(userId, { phoneCodeHash: sent.phoneCodeHash, phoneNumber });
      return { success: true, status: 'CODE_SENT', phone: phoneNumber };
    } catch (e) {
      return { success: false, status: 'ERROR', message: e.message };
    }
  }

  async verifyCode(userId, code, password) {
    try {
      const client = await this.connectIfNeeded(userId);
      const authState = this.userStates.get(userId) || {};
      const phoneNumber = authState.phoneNumber;
      const phoneCodeHash = authState.phoneCodeHash;
      if (!phoneNumber || !phoneCodeHash) {
        return { success: false, message: 'No pending login session' };
      }
      try {
        await client.invoke(new Api.auth.SignIn({ phoneNumber, phoneCodeHash, phoneCode: String(code) }));
      } catch (err) {
        if (String(err?.message || '').includes('SESSION_PASSWORD_NEEDED')) {
          if (!password) return { success: false, status: 'PASSWORD_REQUIRED' };
          const pwd = await client.invoke(new Api.account.GetPassword());
          const srp = await client.computePasswordSrp(pwd, String(password));
          await client.invoke(new Api.auth.CheckPassword({ password: new Api.InputCheckPasswordSRP(srp) }));
        } else {
          throw err;
        }
      }
      this.saveStringSession(userId, client);
      this.userStates.delete(userId);
      return { success: true, status: 'CONNECTED' };
    } catch (e) {
      return { success: false, status: 'ERROR', message: e.message };
    }
  }

  async getStatus(userId) {
    try {
      const client = await this.ensureClient(userId);
      const connected = client.connected ? await client.checkAuthorization().catch(() => false) : false;
      if (connected) return { success: true, status: 'CONNECTED' };
      const state = this.userStates.get(userId);
      if (state?.phoneCodeHash) return { success: true, status: 'AWAITING_CODE' };
      return { success: true, status: 'DISCONNECTED' };
    } catch (e) {
      return { success: false, status: 'ERROR', message: e.message };
    }
  }

  async stopSession(userId) {
    try {
      const client = this.userClients.get(userId);
      if (client) {
        try { await client.destroy(); } catch {}
      }
      this.userClients.delete(userId);
      this.userStates.delete(userId);
      try { fs.unlinkSync(this.getSessionPath(userId)); } catch {}
      return { success: true, message: 'Logged out' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async sendMessage(userId, to, message) {
    try {
      const client = await this.connectIfNeeded(userId);
      const authorized = await client.checkAuthorization();
      if (!authorized) return { success: false, message: 'Not connected' };
      const peer = String(to || '').trim();
      await client.sendMessage(peer, { message: String(message || '') });
      return { success: true, message: 'Sent' };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async listGroups(userId) {
    try {
      const client = await this.connectIfNeeded(userId);
      const authorized = await client.checkAuthorization();
      if (!authorized) return { success: false, message: 'Not connected' };
      const dialogs = await client.getDialogs({ limit: 200 });
      const groups = dialogs
        .filter(d => d.isChannel || d.isGroup)
        .map(d => ({ id: d.id?.toString?.() || String(d.id), name: d.title, type: d.isChannel ? 'channel' : 'group' }));
      return { success: true, groups };
    } catch (e) {
      return { success: false, message: e.message };
    }
  }

  async sendToMultiple(userId, targets, message) {
    let sent = 0, failed = 0;
    try {
      const client = await this.connectIfNeeded(userId);
      const authorized = await client.checkAuthorization();
      if (!authorized) return { success: false, message: 'Not connected' };
      for (const t of targets) {
        try {
          await client.sendMessage(String(t), { message: String(message || '') });
          sent++;
        } catch { failed++; }
      }
      return { success: true, summary: { sent, failed, total: targets.length } };
    } catch (e) {
      return { success: false, message: e.message, summary: { sent, failed, total: targets?.length || 0 } };
    }
  }
}

module.exports = new TelegramService();

