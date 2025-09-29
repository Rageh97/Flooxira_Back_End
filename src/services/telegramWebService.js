const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const QRCode = require('qrcode');

puppeteer.use(StealthPlugin());

class TelegramWebService {
  constructor() {
    this.userBrowsers = new Map(); // userId -> { browser, page }
    this.qrCodes = new Map(); // userId -> dataURL
    this.userStates = new Map();
  }

  async startSession(userId) {
    try {
      if (this.userBrowsers.has(userId)) {
        return { success: true, status: 'connected', message: 'Session already running' };
      }

      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--window-size=1200,900'
        ],
        userDataDir: `./data/tg-web/user_${userId}`
      });
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 900 });

      this.userBrowsers.set(userId, { browser, page });
      this.userStates.set(userId, { initializing: true });

      // Navigate to Telegram Web login
      await page.goto('https://web.telegram.org/k/#/login', { waitUntil: 'domcontentloaded' });

      // Try to extract QR from possible selectors repeatedly for 30s
      const startedAt = Date.now();
      const tryExtract = async () => {
        const selectors = [
          'canvas',
          'canvas.qr__canvas',
          'div.qr > canvas',
          'div.qr_wrap canvas'
        ];
        for (const sel of selectors) {
          const exists = await page.$(sel);
          if (exists) {
            try {
              const dataUrl = await page.evaluate((s) => {
                const c = document.querySelector(s);
                if (!c) return null;
                // Some implementations draw the QR on canvas
                if (c.toDataURL) return c.toDataURL();
                return null;
              }, sel);
              if (dataUrl && dataUrl.startsWith('data:image')) {
                this.qrCodes.set(userId, dataUrl);
                return true;
              }
            } catch {}
          }
        }
        return false;
      };

      // Poll for QR for up to 30 seconds
      while (Date.now() - startedAt < 30000) {
        const ok = await tryExtract();
        if (ok) break;
        await page.waitForTimeout(500);
      }

      // Also set up a periodic refresher to keep QR updated (in case it rotates)
      const refresher = setInterval(async () => {
        try {
          // Update QR if still on login
          await tryExtract();
          // Also detect connected state to clear QR
          const connected = await page.evaluate(() => !!document.querySelector('[contenteditable="true"]')).catch(() => false);
          if (connected) {
            this.qrCodes.delete(userId);
          }
        } catch {}
      }, 1500);
      const state = this.userStates.get(userId) || {};
      state.qrRefresher = refresher;
      this.userStates.set(userId, state);

      return { success: true, status: 'qr_generated', qrCode: this.qrCodes.get(userId) || null };
    } catch (e) {
      return { success: false, message: 'Failed to start Telegram Web', error: e.message };
    }
  }

  async getQRCode(userId) {
    return this.qrCodes.get(userId) || null;
  }

  async getStatus(userId) {
    try {
      const ctx = this.userBrowsers.get(userId);
      if (!ctx) return { success: true, status: 'disconnected', message: 'No active session' };
      const { page } = ctx;
      // Heuristic: if QR canvas exists => not connected; if composer exists => connected
      const state = await page.evaluate(() => {
        const qrCanvas = document.querySelector('canvas, canvas.qr__canvas, div.qr > canvas, div.qr_wrap canvas');
        const composer = document.querySelector('[contenteditable="true"]');
        return { hasQR: !!qrCanvas, hasComposer: !!composer, url: location.href };
      }).catch(() => ({ hasQR: false, hasComposer: false, url: '' }));
      if (state.hasComposer) return { success: true, status: 'CONNECTED', message: 'Telegram Web active' };
      if (state.hasQR) return { success: true, status: 'INITIALIZING', message: 'Waiting for QR scan' };
      return { success: true, status: 'INITIALIZING', message: 'Waiting for login' };
    } catch (e) {
      return { success: false, status: 'error', message: e.message };
    }
  }

  async stopSession(userId) {
    try {
      const ctx = this.userBrowsers.get(userId);
      if (ctx) {
        try { await ctx.browser.close(); } catch {}
      }
      this.userBrowsers.delete(userId);
      this.qrCodes.delete(userId);
      const state = this.userStates.get(userId) || {};
      if (state.qrRefresher) { clearInterval(state.qrRefresher); }
      this.userStates.delete(userId);
      return { success: true, message: 'Telegram Web stopped' };
    } catch (e) {
      return { success: false, message: 'Failed to stop Telegram Web', error: e.message };
    }
  }

  async sendMessage(userId, to, message) {
    try {
      const ctx = this.userBrowsers.get(userId);
      if (!ctx) return { success: false, message: 'Session not running' };
      const { page } = ctx;

      // Open chat by username or numeric id; prefer username with @
      const target = String(to).startsWith('@') ? String(to) : `@${String(to)}`;
      const url = `https://web.telegram.org/k/#/im?p=${encodeURIComponent(target)}`;
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Wait for input area (contenteditable)
      await page.waitForSelector('[contenteditable="true"]', { timeout: 15000 });
      await page.focus('[contenteditable="true"]');
      await page.keyboard.type(String(message || ''), { delay: 5 });
      await page.keyboard.press('Enter');

      return { success: true, message: 'Sent' };
    } catch (e) {
      return { success: false, message: 'Failed to send message', error: e.message };
    }
  }

  
  
  async listGroups(userId) {
    try {
      const ctx = this.userBrowsers.get(userId);
      if (!ctx) return { success: false, message: 'Session not running' };
      const { page } = ctx;
      // Open Saved Messages to ensure side list renders
      await page.goto('https://web.telegram.org/k/', { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      // Read chats from the sidebar
      const items = await page.evaluate(() => {
        const results = [];
        const nodes = document.querySelectorAll('[data-peer-id], [class*="chatlist-chat"]');
        nodes.forEach((n) => {
          const title = n.querySelector('[class*="chatlist-chat-title"], .chatlist-chat__title, .peer-title')?.textContent || '';
          const isChannel = /@/.test(n.textContent || '') || (n.querySelector('[class*="channel"]') ? true : false);
          const isGroup = /members|participant/i.test(n.textContent || '');
          const idAttr = n.getAttribute('data-peer-id') || title || '';
          if (title) {
            results.push({ id: idAttr, name: title.trim(), type: isChannel ? 'channel' : (isGroup ? 'group' : 'private') });
          }
        });
        return results;
      });
      // Deduplicate by name
      const seen = new Set();
      const uniq = items.filter(i => { const k = i.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      return { success: true, groups: uniq.filter(i => i.type !== 'private') };
    } catch (e) {
      return { success: false, message: 'Failed to list groups', error: e.message };
    }
  }

  async sendToMultiple(userId, targets, message) {
    try {
      const ctx = this.userBrowsers.get(userId);
      if (!ctx) return { success: false, message: 'Session not running' };
      const { page } = ctx;
      let sent = 0, failed = 0;
      for (const t of targets) {
        try {
          const target = String(t).startsWith('@') ? String(t) : `@${String(t)}`;
          const url = `https://web.telegram.org/k/#/im?p=${encodeURIComponent(target)}`;
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('[contenteditable="true"]', { timeout: 15000 });
          await page.focus('[contenteditable="true"]');
          await page.keyboard.type(String(message || ''), { delay: 5 });
          await page.keyboard.press('Enter');
          sent++;
          await page.waitForTimeout(400);
        } catch { failed++; }
      }
      return { success: true, summary: { sent, failed, total: targets.length } };
    } catch (e) {
      return { success: false, message: 'Failed bulk send', error: e.message };
    }
  }
}

module.exports = new TelegramWebService();

