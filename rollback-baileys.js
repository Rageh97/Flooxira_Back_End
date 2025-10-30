const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Baileys Rollback Script');
console.log('═══════════════════════════════════════════════════════════\n');

const filesToRollback = [
  'src/controllers/whatsapp.controller.js',
  'src/scheduler.js',
  'src/controllers/campaign.controller.js',
  'src/controllers/reminder.controller.js',
  'src/controllers/botControl.controller.js',
  'src/controllers/media.controller.js'
];

let restoredCount = 0;
let errorCount = 0;

console.log('🔄 Rolling back changes...\n');

filesToRollback.forEach(file => {
  const filePath = path.join(__dirname, file);
  const backupPath = filePath + '.backup';
  
  if (!fs.existsSync(backupPath)) {
    console.log(`   ⚠️  No backup found for: ${file}`);
    return;
  }
  
  try {
    fs.copyFileSync(backupPath, filePath);
    console.log(`   ✅ Restored: ${file}`);
    restoredCount++;
  } catch (err) {
    console.log(`   ❌ Error restoring ${file}: ${err.message}`);
    errorCount++;
  }
});

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  Rollback Summary');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`✅ Files restored: ${restoredCount}`);
console.log(`❌ Errors: ${errorCount}`);

console.log('');
if (errorCount === 0 && restoredCount > 0) {
  console.log('🎉 Rollback completed successfully!');
  console.log('');
  console.log('📌 Next steps:');
  console.log('   1. Restart your backend server: npm start');
  console.log('   2. System is back to whatsapp-web.js');
} else if (restoredCount === 0) {
  console.log('⚠️  No files were restored (no backups found)');
} else {
  console.log('⚠️  Rollback completed with errors!');
}

console.log('');


