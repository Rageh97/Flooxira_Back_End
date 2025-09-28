const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const TelegramAccount = sequelize.define('TelegramAccount', {
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
  botToken: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  botUsername: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  botName: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  webhookUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  lastActivity: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'telegram_accounts',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['botToken'],
      unique: true
    }
  ]
});

User.hasMany(TelegramAccount, { foreignKey: 'userId' });
TelegramAccount.belongsTo(User, { foreignKey: 'userId' });

module.exports = { TelegramAccount };