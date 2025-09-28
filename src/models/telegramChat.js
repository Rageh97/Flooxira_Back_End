const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const TelegramChat = sequelize.define('TelegramChat', {
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
    }
  },
  chatId: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  chatType: {
    type: DataTypes.ENUM('private', 'group', 'supergroup', 'channel'),
    allowNull: false
  },
  chatTitle: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  messageType: {
    type: DataTypes.ENUM('incoming', 'outgoing'),
    allowNull: false
  },
  messageContent: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  messageId: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  responseSource: {
    type: DataTypes.ENUM('knowledge_base', 'openai', 'fallback'),
    allowNull: true
  },
  knowledgeBaseMatch: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  assigneeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  isProcessed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'telegram_chats',
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'chatId']
    },
    {
      fields: ['timestamp']
    },
    {
      fields: ['assigneeId']
    }
  ]
});

User.hasMany(TelegramChat, { foreignKey: 'userId' });
TelegramChat.belongsTo(User, { foreignKey: 'userId' });

// Assignee association
User.hasMany(TelegramChat, { as: 'AssignedTelegramChats', foreignKey: 'assigneeId' });
TelegramChat.belongsTo(User, { as: 'TelegramAssignee', foreignKey: 'assigneeId' });

module.exports = { TelegramChat };