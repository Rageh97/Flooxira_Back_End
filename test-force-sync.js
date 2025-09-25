const { sequelize } = require('./src/sequelize');

async function testForceSync() {
  try {
    console.log('🧪 Testing force sync...');
    
    // Set environment variable
    process.env.DB_SYNC_MODE = 'force';
    
    console.log('📝 Environment set: DB_SYNC_MODE=force');
    
    // Test the sync logic
    const dbSyncMode = (process.env.DB_SYNC || process.env.DB_SYNC_MODE || '').toLowerCase();
    const syncOptions = dbSyncMode === 'force' ? { force: true } : {};
    
    console.log('🔍 Sync options:', syncOptions);
    
    if (syncOptions.force) {
      console.log('🔥 FORCE SYNC: Dropping and recreating ALL tables...');
      await sequelize.sync(syncOptions);
      console.log('✅ FORCE SYNC COMPLETED: All tables dropped and recreated!');
    } else {
      console.log('❌ Force sync not enabled');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Run test
testForceSync()
  .then(() => {
    console.log('✅ Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
