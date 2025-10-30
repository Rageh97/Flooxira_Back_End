const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Baileys WhatsApp Test (Alternative Solution)');
console.log('═══════════════════════════════════════════════════════════\n');

let startTime = Date.now();
let connectionTimer = null;

async function connectToWhatsApp() {
  try {
    // Create auth directory
    const authPath = path.join(__dirname, 'data', 'baileys-auth');
    if (!fs.existsSync(authPath)) {
      fs.mkdirSync(authPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false, // We'll use QRCode.toDataURL instead
      browser: ['Chrome (Windows)', 'Chrome', '120.0.0.0']
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        console.log('\n📱 QR Code Generated!');
        console.log('⏰ Scan it from your phone now!\n');
        
        // Generate QR code in terminal
        const qrcodeTerminal = require('qrcode-terminal');
        qrcodeTerminal.generate(qr, { small: true });
        
        // Also save as image
        try {
          const qrDataURL = await QRCode.toDataURL(qr);
          const qrPath = path.join(__dirname, 'baileys-qr.txt');
          fs.writeFileSync(qrPath, qrDataURL);
          console.log(`✅ QR code also saved to: ${qrPath}\n`);
        } catch (e) {
          console.log('⚠️  Could not save QR image (non-critical)');
        }
      }
      
      if (connection === 'close') {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        
        console.log(`\n❌ Connection closed after ${elapsed}s`);
        console.log('Reason:', lastDisconnect?.error?.output?.statusCode);
        console.log('Should reconnect:', shouldReconnect);
        
        if (connectionTimer) {
          clearInterval(connectionTimer);
        }
        
        if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) {
          console.log('\n🚨 LOGGED OUT!');
          console.log('💡 This is the same problem as whatsapp-web.js');
          console.log('💡 Try:');
          console.log('   1. Different phone number');
          console.log('   2. Different network/VPN');
          console.log('   3. Wait 24 hours and try again');
          process.exit(1);
        } else if (shouldReconnect) {
          console.log('🔄 Reconnecting...');
          setTimeout(() => connectToWhatsApp(), 5000);
        }
      } else if (connection === 'open') {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`\n🎉 SUCCESS! Connected with Baileys! (after ${elapsed}s)`);
        console.log('✅ Connection is stable\n');
        console.log('⏰ Monitoring stability for 5 minutes...\n');
        
        // Log every 30 seconds
        let counter = 0;
        connectionTimer = setInterval(() => {
          counter += 30;
          const totalTime = Math.floor((Date.now() - startTime) / 1000);
          console.log(`✅ Still connected after ${totalTime}s (${counter}s stable)`);
          
          if (counter >= 300) { // 5 minutes
            console.log('\n🎉🎉🎉 SUCCESS! Connection stable for 5+ minutes!');
            console.log('✅ Baileys works perfectly!');
            console.log('💡 Now you should migrate your system to use Baileys\n');
            clearInterval(connectionTimer);
          }
        }, 30000);
      } else if (connection === 'connecting') {
        console.log('🔄 Connecting to WhatsApp...');
      }
    });

    sock.ev.on('creds.update', saveCreds);
    
    // Message handler (test)
    sock.ev.on('messages.upsert', async ({ messages }) => {
      const msg = messages[0];
      if (!msg.message || msg.key.fromMe) return;
      
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
      const from = msg.key.remoteJid;
      
      console.log(`\n📩 Message received from ${from}:`);
      console.log(`   "${text}"\n`);
      
      // Auto-reply test
      try {
        await sock.sendMessage(from, { 
          text: '✅ تم استلام رسالتك! هذا رد تلقائي من Baileys (اختبار)' 
        });
        console.log('✅ Auto-reply sent\n');
      } catch (e) {
        console.log('⚠️  Could not send reply:', e.message);
      }
    });

    console.log('🚀 Baileys client initialized');
    console.log('📌 Waiting for QR code or authentication...\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Start
connectToWhatsApp();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  if (connectionTimer) {
    clearInterval(connectionTimer);
  }
  process.exit(0);
});


