const venom = require('venom-bot');
const puppeteer = require('puppeteer');

venom.create({
  session: 'user_1',
  // اعرض المتصفح لتشوف أي رسالة من واتساب
  headless: false,
  // استخدم Chromium المدمج مع Puppeteer (أكثر قبولاً من Chrome النظام)
  browserPathExecutable: puppeteer.executablePath(),
  logQR: false,
  catchQR: (base64, ascii) => {
    console.clear();
    console.log('\n=== Scan this QR ===\n');
    console.log(ascii);
    console.log('\n====================\n');
  },
  waitForLogin: true,
  retries: 3,
  timeOut: 90,
  disableWelcome: true,
  autoClose: 0,
  useChrome: false,
  addBrowserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--allow-running-insecure-content',
    '--remote-allow-origins=*',
    '--window-size=1280,800'
  ]
})
.then(start)
.catch(e => console.log('init error:', e));

function start(client) {
  console.log('✅ Venom started. امسح QR من النافذة أو التيرمنال.');
  client.onStateChange(state => console.log('state:', state));
  client.onStreamChange(status => console.log('stream:', status));
  client.onMessage(async (message) => {
    if (message.isGroupMsg) return;
    try {
      await client.sendText(message.from, 'تم استلام رسالتك ✅ (Venom Test)');
    } catch (e) {
      console.log('send error:', e?.message || e);
    }
  });
}