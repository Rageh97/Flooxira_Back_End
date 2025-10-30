const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════');
console.log('  WhatsApp Connection Diagnostic Tool');
console.log('═══════════════════════════════════════════════════════════\n');

async function diagnose() {
  const results = {
    environment: {},
    puppeteer: {},
    whatsappWebJs: {},
    sessionFiles: {},
    recommendations: []
  };

  // 1. Check Environment
  console.log('📋 1. Checking Environment...');
  results.environment.nodeVersion = process.version;
  results.environment.platform = process.platform;
  results.environment.arch = process.arch;
  console.log(`   Node.js: ${process.version}`);
  console.log(`   Platform: ${process.platform}`);
  console.log(`   Architecture: ${process.arch}`);

  // 2. Check Puppeteer
  console.log('\n📋 2. Checking Puppeteer...');
  try {
    const packageJson = require('./package.json');
    results.puppeteer.version = packageJson.dependencies.puppeteer;
    console.log(`   Puppeteer version: ${results.puppeteer.version}`);
    
    // Test Puppeteer launch
    console.log('   Testing Puppeteer launch...');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    results.puppeteer.canLaunch = true;
    console.log('   ✅ Puppeteer can launch browser');
    
    const version = await browser.version();
    results.puppeteer.chromeVersion = version;
    console.log(`   Chrome version: ${version}`);
    
    await browser.close();
  } catch (err) {
    results.puppeteer.canLaunch = false;
    results.puppeteer.error = err.message;
    console.log(`   ❌ Puppeteer launch failed: ${err.message}`);
    results.recommendations.push('Install/reinstall Puppeteer: npm install puppeteer');
  }

  // 3. Check whatsapp-web.js
  console.log('\n📋 3. Checking whatsapp-web.js...');
  try {
    const packageJson = require('./package.json');
    results.whatsappWebJs.version = packageJson.dependencies['whatsapp-web.js'];
    console.log(`   whatsapp-web.js version: ${results.whatsappWebJs.version}`);
    
    // Check if it's a known problematic version
    const version = results.whatsappWebJs.version.replace(/[^0-9.]/g, '');
    const [major, minor] = version.split('.').map(Number);
    
    if (major === 1 && minor >= 24) {
      console.log('   ⚠️  You are using a newer version that may have detection issues');
      results.recommendations.push('Try downgrading: npm install whatsapp-web.js@1.23.0');
    } else {
      console.log('   ✅ Version seems stable');
    }
  } catch (err) {
    console.log(`   ❌ Could not check version: ${err.message}`);
  }

  // 4. Check Session Files
  console.log('\n📋 4. Checking Session Files...');
  const authPaths = [
    { name: '.wwebjs_auth', path: path.join(__dirname, '.wwebjs_auth') },
    { name: 'data/wa-auth', path: path.join(__dirname, 'data', 'wa-auth') }
  ];

  authPaths.forEach(({ name, path: dirPath }) => {
    if (fs.existsSync(dirPath)) {
      const entries = fs.readdirSync(dirPath);
      results.sessionFiles[name] = {
        exists: true,
        count: entries.length,
        sessions: entries
      };
      console.log(`   📁 ${name}: ${entries.length} session(s) found`);
      if (entries.length > 0) {
        entries.forEach(entry => {
          const fullPath = path.join(dirPath, entry);
          const stats = fs.statSync(fullPath);
          const age = Math.floor((Date.now() - stats.mtimeMs) / 1000 / 60); // minutes
          console.log(`      - ${entry} (${age} minutes old)`);
        });
      }
    } else {
      results.sessionFiles[name] = { exists: false };
      console.log(`   📁 ${name}: Not found`);
    }
  });

  // 5. Check for file locks
  console.log('\n📋 5. Checking for File Locks...');
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      try {
        const output = execSync('tasklist /FI "IMAGENAME eq chrome.exe"', { encoding: 'utf8' });
        const chromeProcesses = output.split('\n').filter(line => line.includes('chrome.exe')).length;
        results.sessionFiles.chromeProcesses = chromeProcesses;
        if (chromeProcesses > 0) {
          console.log(`   ⚠️  Found ${chromeProcesses} Chrome process(es) running`);
          results.recommendations.push('Kill Chrome processes: taskkill /F /IM chrome.exe /T');
        } else {
          console.log('   ✅ No Chrome processes found');
        }
      } catch (e) {
        console.log('   ℹ️  Could not check Chrome processes');
      }
    }
  } catch (err) {
    console.log(`   ℹ️  Could not check for locks: ${err.message}`);
  }

  // 6. Network Check
  console.log('\n📋 6. Checking Network...');
  try {
    const https = require('https');
    await new Promise((resolve, reject) => {
      https.get('https://web.whatsapp.com', (res) => {
        results.network = {
          canReachWhatsApp: true,
          statusCode: res.statusCode
        };
        console.log(`   ✅ Can reach web.whatsapp.com (${res.statusCode})`);
        resolve();
      }).on('error', (err) => {
        results.network = {
          canReachWhatsApp: false,
          error: err.message
        };
        console.log(`   ❌ Cannot reach web.whatsapp.com: ${err.message}`);
        results.recommendations.push('Check your internet connection or firewall');
        reject(err);
      });
    });
  } catch (err) {
    // Already logged
  }

  // 7. Test Basic Puppeteer Connection to WhatsApp Web
  console.log('\n📋 7. Testing WhatsApp Web Connection...');
  try {
    console.log('   Launching browser...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    console.log('   Opening WhatsApp Web...');
    const page = await browser.newPage();
    
    // Remove automation indicators
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    await page.goto('https://web.whatsapp.com', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    console.log('   ✅ Successfully loaded WhatsApp Web');
    results.whatsappWebConnection = { success: true };
    
    // Check if QR code appears
    try {
      await page.waitForSelector('canvas', { timeout: 10000 });
      console.log('   ✅ QR code canvas detected');
      results.whatsappWebConnection.qrDetected = true;
    } catch (e) {
      console.log('   ⚠️  QR code not detected (might be already logged in)');
      results.whatsappWebConnection.qrDetected = false;
    }
    
    await browser.close();
  } catch (err) {
    console.log(`   ❌ Failed to connect to WhatsApp Web: ${err.message}`);
    results.whatsappWebConnection = { 
      success: false, 
      error: err.message 
    };
    results.recommendations.push('WhatsApp Web may be blocked or down');
  }

  // 8. Generate Report
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  📊 Diagnostic Summary');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Detect probable causes
  console.log('🔍 Probable Causes of LOGOUT:\n');
  
  let detectedIssues = 0;

  if (results.whatsappWebJs.version && parseFloat(results.whatsappWebJs.version.replace(/[^0-9.]/g, '')) >= 1.24) {
    detectedIssues++;
    console.log(`   ${detectedIssues}. ⚠️  **WhatsApp-web.js version too new** (${results.whatsappWebJs.version})`);
    console.log('       WhatsApp may have added detection for newer library versions');
  }

  if (results.sessionFiles['.wwebjs_auth']?.count > 0 || results.sessionFiles['data/wa-auth']?.count > 0) {
    detectedIssues++;
    console.log(`   ${detectedIssues}. ⚠️  **Old session files detected**`);
    console.log('       Corrupted sessions can trigger immediate LOGOUT');
  }

  if (results.sessionFiles.chromeProcesses > 0) {
    detectedIssues++;
    console.log(`   ${detectedIssues}. ⚠️  **Chrome processes still running**`);
    console.log('       Locked files prevent proper session cleanup');
  }

  if (!results.puppeteer.canLaunch) {
    detectedIssues++;
    console.log(`   ${detectedIssues}. ❌ **Puppeteer cannot launch browser**`);
    console.log('       This will prevent any connection');
  }

  if (detectedIssues === 0) {
    console.log('   ℹ️  No obvious issues detected. The problem may be:');
    console.log('      - WhatsApp account flagged for automation');
    console.log('      - Network/ISP blocking automation patterns');
    console.log('      - Recent WhatsApp Web.js detection updates');
  }

  // Recommendations
  console.log('\n💡 Recommended Solutions (in order):\n');
  
  console.log('   1️⃣  **Downgrade whatsapp-web.js to stable version**');
  console.log('       cd back-end');
  console.log('       npm uninstall whatsapp-web.js');
  console.log('       npm install whatsapp-web.js@1.23.0');
  console.log('       npm install');
  
  console.log('\n   2️⃣  **Clean ALL session files completely**');
  console.log('       node cleanup-sessions.js');
  console.log('       (Then wait 10 minutes before trying again)');
  
  console.log('\n   3️⃣  **Use a different network/VPN**');
  console.log('       Your ISP or network might be flagging automation');
  
  console.log('\n   4️⃣  **Try with a different phone number**');
  console.log('       Your current number might be flagged by WhatsApp');
  
  console.log('\n   5️⃣  **Enable "Linked Devices" Beta on your phone**');
  console.log('       WhatsApp → Settings → Linked Devices');
  console.log('       This might use different authentication flow');

  console.log('\n   6️⃣  **Use NoAuth strategy (for testing)**');
  console.log('       This requires QR scan every time but avoids session issues');

  console.log('\n═══════════════════════════════════════════════════════════\n');

  // Save report
  const reportPath = path.join(__dirname, 'diagnostic-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Full report saved to: ${reportPath}\n`);
}

diagnose().catch(err => {
  console.error('\n❌ Diagnostic failed:', err);
  process.exit(1);
});






