const { WhatsappSession } = require('../models/whatsappSession');

class SequelizeAuth {
  constructor(options = {}) {
    this.clientId = options.clientId;
    this.userId = options.userId;
  }

  setup(client) {
    // Called by whatsapp-web.js to provide the Client instance
    this.client = client;
  }

  async beforeBrowserInitialized() {
    // Called before browser is launched
    console.log(`[SequelizeAuth] Initializing session for clientId: ${this.clientId}`);
  }

  async afterBrowserInitialized() {
    // Called after browser is launched
    console.log(`[SequelizeAuth] Browser initialized for clientId: ${this.clientId}`);
  }

  async onAuthenticationNeeded() {
    // whatsapp-web.js calls this to retrieve stored session on startup
    const payload = await this.getAuthEventPayload();
    // Must not return null; return empty object if nothing stored
    return payload || {};
  }

  async onAuthenticated(payload) {
    // Called when session data is available and should be persisted
    await this.setAuthEventPayload(payload);
  }

  async getAuthEventPayload() {
    // Return session data to be injected into WhatsApp Web
    try {
      const session = await WhatsappSession.findOne({
        where: { clientId: this.clientId, isActive: true }
      });

      if (session && session.sessionData) {
        console.log(`[SequelizeAuth] Found existing session data for ${this.clientId}`);
        return JSON.parse(session.sessionData);
      }

      console.log(`[SequelizeAuth] No existing session data for ${this.clientId}`);
      return null;
    } catch (error) {
      console.error('[SequelizeAuth] Error getting auth payload:', error);
      return null;
    }
  }

  async setAuthEventPayload(payload) {
    // Save session data from WhatsApp Web
    try {
      const sessionDataJson = JSON.stringify(payload);
      const dataSizeKB = (sessionDataJson.length / 1024).toFixed(2);
      console.log(`[SequelizeAuth] 💾 Saving session data for ${this.clientId} (${dataSizeKB} KB)`);
      
      const [session, created] = await WhatsappSession.findOrCreate({
        where: { clientId: this.clientId },
        defaults: {
          userId: this.userId,
          clientId: this.clientId,
          sessionData: sessionDataJson,
          isActive: true
        }
      });

      if (!created) {
        session.sessionData = sessionDataJson;
        session.isActive = true;
        await session.save();
        console.log(`[SequelizeAuth] ✅ Session data updated for ${this.clientId}`);
      } else {
        console.log(`[SequelizeAuth] ✅ New session data created for ${this.clientId}`);
      }

      console.log(`[SequelizeAuth] Session data saved successfully for ${this.clientId}`);
    } catch (error) {
      console.error('[SequelizeAuth] Error saving auth payload:', error);
    }
  }

  async destroy() {
    // Clean up session data
    try {
      console.log(`[SequelizeAuth] Destroying session for ${this.clientId}`);
      
      const session = await WhatsappSession.findOne({
        where: { clientId: this.clientId }
      });

      if (session) {
        session.isActive = false;
        await session.save();
      }

      console.log(`[SequelizeAuth] Session destroyed for ${this.clientId}`);
    } catch (error) {
      console.error('[SequelizeAuth] Error destroying session:', error);
    }
  }

  async logout() {
    // Logout and clean up
    try {
      console.log(`[SequelizeAuth] Logging out ${this.clientId}`);
      
      const session = await WhatsappSession.findOne({
        where: { clientId: this.clientId }
      });

      if (session) {
        session.sessionData = null;
        session.isActive = false;
        await session.save();
      }

      console.log(`[SequelizeAuth] Logged out ${this.clientId}`);
    } catch (error) {
      console.error('[SequelizeAuth] Error during logout:', error);
    }
  }
}

module.exports = SequelizeAuth;
