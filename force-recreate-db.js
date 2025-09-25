const { sequelize } = require('./src/sequelize');

async function forceRecreateDatabase() {
  try {
    console.log('🔄 Force recreating entire database...');
    
    // Drop all tables (force: true)
    console.log('🗑️  Dropping all tables...');
    await sequelize.drop({ force: true });
    console.log('✅ All tables dropped');
    
    // Sync all models (force: true to recreate)
    console.log('🔄 Recreating all tables with correct schema...');
    await sequelize.sync({ force: true });
    console.log('✅ All tables recreated');
    
    // Verify tables exist
    const [results] = await sequelize.query("SHOW TABLES");
    console.log('📋 Created tables:', results.map(r => Object.values(r)[0]));
    
    console.log('🎉 Database force recreation completed successfully!');
    console.log('💡 You can now start your application - all tables are fresh');
    
  } catch (error) {
    console.error('❌ Force recreation failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  forceRecreateDatabase()
    .then(() => {
      console.log('✅ Force recreation completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Force recreation failed:', error);
      process.exit(1);
    });
}

module.exports = { forceRecreateDatabase };
