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
  contentType: {
    type: DataTypes.ENUM('text', 'image', 'video', 'audio', 'document'),
    allowNull: false,
    defaultValue: 'text'
  },
  mediaUrl: {
    type: DataTypes.STRING(512),
    allowNull: true
  },
  mediaFilename: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  mediaMimetype: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  responseSource: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  knowledgeBaseMatch: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  sessionId: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  context: {
    type: DataTypes.JSON,
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
  tableName: 'whatsapp_chats',
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'contactNumber']
    },
    {
      fields: ['timestamp']
    },
    {
      fields: ['assigneeId']
    },
    {
      fields: ['sessionId']
    },
    {
      fields: ['userId', 'contactNumber', 'timestamp']
    }
  ]
});

User.hasMany(WhatsappChat, { foreignKey: 'userId' });
WhatsappChat.belongsTo(User, { foreignKey: 'userId' });

// Assignee association
User.hasMany(WhatsappChat, { as: 'AssignedChats', foreignKey: 'assigneeId' });
WhatsappChat.belongsTo(User, { as: 'Assignee', foreignKey: 'assigneeId' });

module.exports = { WhatsappChat };




