require('dotenv').config();
const { sequelize } = require('./src/sequelize');

async function fixMessageUsageTable() {
  try {
    console.log('🔧 Fixing message_usage table...');
    
    // Check if table exists
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
    
    const hasMessageType = columns.some((col: any) => col.name === 'messageType');
    
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
      
      // Update existing records to have 'bot_response' type
      console.log('🔄 Updating existing records...');
      await sequelize.query(`
        UPDATE message_usage 
        SET messageType = 'bot_response' 
        WHERE messageType = 'outgoing'
      `);
      
      console.log('✅ Existing records updated!');
    }
    
    // Verify the fix
    const [updatedColumns] = await sequelize.query(`
      PRAGMA table_info(message_usage);
    `);
    
    console.log('📋 Current message_usage table structure:');
    updatedColumns.forEach((col: any) => {
      console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : 'NULL'}`);
    });
    
    console.log('🎉 message_usage table fixed successfully!');
    
  } catch (error) {
    console.error('❌ Error fixing message_usage table:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

fixMessageUsageTable();
