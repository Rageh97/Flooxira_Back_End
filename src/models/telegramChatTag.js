const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const TelegramChatTag = sequelize.define('TelegramChatTag', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  tagId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'tags', key: 'id' } },
  chatId: { type: DataTypes.STRING(64), allowNull: false },
  chatTitle: { type: DataTypes.STRING(255), allowNull: true }
}, {
  tableName: 'telegram_chat_tags',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['tagId'] },
    { fields: ['chatId'] },
    { unique: true, fields: ['userId', 'tagId', 'chatId'] }
  ]
});

module.exports = { TelegramChatTag };








