const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Baileys Migration Script');
console.log('═══════════════════════════════════════════════════════════\n');

const filesToUpdate = [
  'src/controllers/whatsapp.controller.js',
  'src/scheduler.js',
  'src/controllers/campaign.controller.js',
  'src/controllers/reminder.controller.js',
  'src/controllers/botControl.controller.js',
  'src/controllers/media.controller.js'
];

let updatedCount = 0;
let errorCount = 0;

console.log('📝 Files to update:');
filesToUpdate.forEach((file, i) => {
  console.log(`   ${i + 1}. ${file}`);
});
console.log('');

// Backup first
console.log('🔄 Creating backups...');
filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  const backupPath = filePath + '.backup';
  
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, backupPath);
      console.log(`   ✅ Backed up: ${file}`);
    } catch (err) {
      console.log(`   ❌ Failed to backup ${file}: ${err.message}`);
      errorCount++;
    }
  } else {
    console.log(`   ⚠️  File not found: ${file}`);
  }
});

console.log('');
console.log('🔧 Updating files...');

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`   ⚠️  Skipped (not found): ${file}`);
    return;
  }
  
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Replace require statement
    content = content.replace(
      /require\(['"]\.\.\/services\/whatsappService['"]\)/g,
      "require('../services/baileysService')"
    );
    
    content = content.replace(
      /require\(['"]\.\/services\/whatsappService['"]\)/g,
      "require('./services/baileysService')"
    );
    
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`   ✅ Updated: ${file}`);
      updatedCount++;
    } else {
      console.log(`   ℹ️  No changes needed: ${file}`);
    }
  } catch (err) {
    console.log(`   ❌ Error updating ${file}: ${err.message}`);
    errorCount++;
  }
});

console.log('');
console.log('═══════════════════════════════════════════════════════════');
console.log('  Migration Summary');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`✅ Files updated: ${updatedCount}`);
console.log(`❌ Errors: ${errorCount}`);
console.log(`📁 Total files processed: ${filesToUpdate.length}`);

console.log('');
if (errorCount === 0) {
  console.log('🎉 Migration completed successfully!');
  console.log('');
  console.log('📌 Next steps:');
  console.log('   1. Restart your backend server: npm start');
  console.log('   2. Test WhatsApp connection');
  console.log('   3. Check that all features work');
  console.log('');
  console.log('🔄 To rollback:');
  console.log('   node rollback-baileys.js');
} else {
  console.log('⚠️  Migration completed with errors!');
  console.log('');
  console.log('🔄 To rollback:');
  console.log('   node rollback-baileys.js');
}

console.log('');


