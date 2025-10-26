require('dotenv').config();
const { sequelize } = require('./src/sequelize');

async function runSimpleMigration() {
  try {
    console.log('🔧 Running simple migration...');
    
    // Check if message_usage table exists
    const [tables] = await sequelize.query(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='message_usage';
    `);
    
    if (tables.length === 0) {
      console.log('❌ message_usage table does not exist!');
      return;
    }
    
    // Check if messageType column exists
    const [columns] = await sequelize.query(`
      PRAGMA table_info(message_usage);
    `);
    
    const hasMessageType = columns.some((col) => col.name === 'messageType');
    
    if (hasMessageType) {
      console.log('✅ messageType column already exists!');
    } else {
      console.log('➕ Adding messageType column...');
      
      // Add messageType column
      await sequelize.query(`
        ALTER TABLE message_usage 
        ADD COLUMN messageType VARCHAR(255) NOT NULL DEFAULT 'outgoing'
      `);
      
      console.log('✅ messageType column added successfully!');
    }
    
    console.log('🎉 Migration completed successfully!');
    
  } catch (error) {
    if (error.message.includes('duplicate column name') || error.message.includes('already exists')) {
      console.log('✅ messageType column already exists!');
    } else {
      console.error('❌ Migration error:', error.message);
    }
  } finally {
    await sequelize.close();
  }
}

runSimpleMigration();


