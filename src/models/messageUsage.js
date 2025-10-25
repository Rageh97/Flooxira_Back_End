const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const MessageUsage = sequelize.define('MessageUsage', {
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
  platform: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['whatsapp', 'telegram']]
    }
  },
  messageType: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      isIn: [['outgoing', 'campaign', 'template', 'bot_response']]
    }
  },
  count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  month: {
    type: DataTypes.INTEGER,
    allowNull: false // 1-12
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  }
}, {
  tableName: 'message_usage',
  timestamps: true,
  indexes: [
    { fields: ['userId', 'platform', 'month', 'year'] },
    { fields: ['userId'] },
    { fields: ['platform'] }
  ]
});

module.exports = { MessageUsage };




