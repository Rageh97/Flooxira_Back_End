const { sequelize } = require('./src/sequelize');

async function addAssigneeColumn() {
  try {
    console.log('Adding assigneeId column to whatsapp_chats table...');
    
    // Add the assigneeId column
    await sequelize.query(`
      ALTER TABLE whatsapp_chats 
      ADD COLUMN assigneeId INT NULL,
      ADD INDEX idx_assignee_id (assigneeId)
    `);
    
    console.log('✅ assigneeId column added successfully!');
    
    // Add foreign key constraint if it doesn't exist
    try {
      await sequelize.query(`
        ALTER TABLE whatsapp_chats 
        ADD CONSTRAINT fk_whatsapp_chats_assignee 
        FOREIGN KEY (assigneeId) REFERENCES users(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
      console.log('✅ Foreign key constraint added successfully!');
    } catch (fkError) {
      if (fkError.message.includes('Duplicate key name')) {
        console.log('ℹ️  Foreign key constraint already exists');
      } else {
        console.log('⚠️  Could not add foreign key constraint:', fkError.message);
      }
    }
    
  } catch (error) {
    if (error.message.includes('Duplicate column name')) {
      console.log('ℹ️  assigneeId column already exists');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  addAssigneeColumn()
    .then(() => {
      console.log('Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { addAssigneeColumn };
