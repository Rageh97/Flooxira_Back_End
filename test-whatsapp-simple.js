const { Client, LocalAuth } = require('whatsapp-web.js');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Simple WhatsApp Test (Visible Mode)');
console.log('═══════════════════════════════════════════════════════════\n');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'test_session'
  }),
  puppeteer: {
    headless: false, // نافذة مرئية
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  }
});

let startTime = Date.now();

client.on('qr', (qr) => {
  console.log('\n✅ QR Code generated!');
  console.log('📱 Scan it from your phone now!');
  console.log('⏰ Keep WhatsApp open for 5 minutes after scanning\n');
});

client.on('authenticated', () => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log(`\n✅ Authenticated! (after ${elapsed}s)`);
});

client.on('ready', () => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log(`\n🎉 SUCCESS! WhatsApp is ready! (after ${elapsed}s)`);
  console.log('✅ Connection is stable\n');
  console.log('⏰ Wait 5 minutes to confirm stability...\n');
  
  // Log every 30 seconds to show we're still connected
  let counter = 0;
  setInterval(() => {
    counter += 30;
    console.log(`✅ Still connected after ${counter} seconds`);
  }, 30000);
});

client.on('disconnected', (reason) => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log(`\n❌ DISCONNECTED after ${elapsed}s - Reason: ${reason}`);
  
  if (reason === 'LOGOUT') {
    console.log('\n🚨 CRITICAL: WhatsApp detected automation!');
    console.log('\n💡 This means:');
    console.log('   1. Your WhatsApp account might be flagged');
    console.log('   2. Your network/ISP might be blocking automation');
    console.log('   3. WhatsApp has updated detection (whatsapp-web.js no longer works)');
    console.log('\n🎯 Recommended solutions:');
    console.log('   1. Try a different phone number');
    console.log('   2. Try a different network/VPN');
    console.log('   3. Use WhatsApp Business API (official but paid)');
    console.log('   4. Use Baileys library instead of whatsapp-web.js\n');
  }
  
  process.exit(1);
});

client.on('auth_failure', (msg) => {
  console.log('\n❌ Authentication failed:', msg);
  process.exit(1);
});

console.log('🚀 Starting WhatsApp client...');
console.log('📌 A Chrome window will open - don\'t close it!\n');

client.initialize().catch(err => {
  console.error('\n❌ Failed to initialize:', err.message);
  process.exit(1);
});

// Exit handler
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down gracefully...');
  client.destroy();
  process.exit(0);
});






