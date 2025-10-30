const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const AIConversation = sequelize.define('AIConversation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'محادثة جديدة'
  }
}, {
  tableName: 'ai_conversations',
  timestamps: true
});

module.exports = { AIConversation };















