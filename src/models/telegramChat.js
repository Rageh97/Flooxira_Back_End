const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const TelegramChat = sequelize.define('TelegramChat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  chatId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  chatType: {
    type: DataTypes.STRING,
    allowNull: true // 'private', 'group', 'supergroup', 'channel'
  },
  chatTitle: {
    type: DataTypes.STRING,
    allowNull: true
  },
  messageType: {
    type: DataTypes.ENUM('incoming', 'outgoing'),
    allowNull: false
  },
  messageContent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  responseSource: {
    type: DataTypes.STRING,
    allowNull: true // 'fuse', 'openai', 'gemini', 'fallback', 'manual'
  },
  knowledgeBaseMatch: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  timestamp: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'telegram_chats',
  timestamps: true,
  indexes: [
    { fields: ['userId', 'chatId'] },
    { fields: ['timestamp'] }
  ]
});

module.exports = TelegramChat;