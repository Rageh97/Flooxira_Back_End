const fs = require('fs');
const path = require('path');

// 🧹 تنظيف ملفات Session القديمة والمقفلة
function cleanupSessions() {
  console.log('🧹 Starting WhatsApp session cleanup...');
  
  const oldAuthPath = path.join(__dirname, '.wwebjs_auth');
  const newAuthPath = path.join(__dirname, 'data', 'wa-auth');
  
  const pathsToClean = [oldAuthPath, newAuthPath];
  
  pathsToClean.forEach(authPath => {
    if (fs.existsSync(authPath)) {
      console.log(`\n📁 Cleaning: ${authPath}`);
      
      try {
        // Get all session directories
        const entries = fs.readdirSync(authPath);
        
        entries.forEach(entry => {
          const fullPath = path.join(authPath, entry);
          
          try {
            // Remove directory recursively
            if (fs.statSync(fullPath).isDirectory()) {
              console.log(`  🗑️  Removing: ${entry}`);
              fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 3 });
            }
          } catch (err) {
            // Ignore locked files - we'll handle them differently
            if (err.code === 'EBUSY' || err.code === 'EPERM') {
              console.log(`  ⚠️  Skipped (locked): ${entry}`);
              console.log(`     Tip: Close any Chrome/Node processes and run again`);
            } else {
              console.log(`  ❌ Error removing ${entry}:`, err.message);
            }
          }
        });
        
        console.log(`✅ Cleaned: ${authPath}`);
      } catch (err) {
        console.log(`⚠️  Could not access ${authPath}:`, err.message);
      }
    } else {
      console.log(`\n📁 Not found: ${authPath} (OK)`);
    }
  });
  
  console.log('\n✅ Cleanup completed!');
  console.log('\n💡 Next steps:');
  console.log('   1. Restart your backend server');
  console.log('   2. Scan QR code again');
  console.log('   3. Keep WhatsApp open on your phone for 2-3 minutes after scanning');
}

// Kill any hanging Chrome processes (Windows)
function killChromeProcesses() {
  console.log('\n🔫 Attempting to kill Chrome processes...');
  
  if (process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
      console.log('✅ Chrome processes killed');
    } catch (err) {
      console.log('ℹ️  No Chrome processes to kill (or permission denied)');
    }
  } else {
    console.log('ℹ️  Auto-kill only works on Windows. Manually close Chrome if needed.');
  }
}

// Run cleanup
console.log('═══════════════════════════════════════════════════════════');
console.log('  WhatsApp Session Cleanup Script');
console.log('═══════════════════════════════════════════════════════════\n');

killChromeProcesses();
setTimeout(() => {
  cleanupSessions();
}, 2000);










