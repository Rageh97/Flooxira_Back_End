const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const WhatsappChat = sequelize.define('WhatsappChat', {
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
  contactNumber: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  contactName: {
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
  responseSource: {
    type: DataTypes.ENUM('knowledge_base', 'openai', 'fallback'),
    allowNull: true
  },
  knowledgeBaseMatch: {
    type: DataTypes.STRING(255),
    allowNull: true
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
  tableName: 'whatsapp_chats',
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'contactNumber']
    },
    {
      fields: ['timestamp']
    }
  ]
});

User.hasMany(WhatsappChat, { foreignKey: 'userId' });
WhatsappChat.belongsTo(User, { foreignKey: 'userId' });

module.exports = { WhatsappChat };




