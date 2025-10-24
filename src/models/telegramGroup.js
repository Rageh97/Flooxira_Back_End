const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const TelegramGroup = sequelize.define('TelegramGroup', {
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
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Telegram chat ID (group or channel)'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Group or channel name'
  },
  type: {
    type: DataTypes.ENUM('group', 'supergroup', 'channel'),
    defaultValue: 'group',
    comment: 'Type of Telegram chat'
  },
  botIsAdmin: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether bot has admin rights in this group/channel'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Whether this group/channel is active for posting'
  }
}, {
  tableName: 'telegram_groups',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['chatId'] },
    { fields: ['userId', 'chatId'], unique: true }
  ]
});

module.exports = TelegramGroup;












