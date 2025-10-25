require('dotenv').config();
const { sequelize } = require('./src/sequelize');

async function addMessageTypeColumn() {
  try {
    console.log('Adding messageType column to message_usage table...');
    
    // Check if column exists first
    const [results] = await sequelize.query(`
      PRAGMA table_info(message_usage);
    `);
    
    const hasMessageType = results.some((col: any) => col.name === 'messageType');
    
    if (hasMessageType) {
      console.log('✅ messageType column already exists!');
    } else {
      // Add the column using raw SQL
      await sequelize.query(`
        ALTER TABLE message_usage 
        ADD COLUMN messageType VARCHAR(255) NOT NULL DEFAULT 'outgoing'
      `);
      
      console.log('✅ messageType column added successfully!');
    }
  } catch (error) {
    if (error.message.includes('duplicate column name') || error.message.includes('already exists')) {
      console.log('✅ messageType column already exists!');
    } else {
      console.error('❌ Error adding messageType column:', error.message);
      process.exit(1);
    }
  } finally {
    await sequelize.close();
  }
}

addMessageTypeColumn();
