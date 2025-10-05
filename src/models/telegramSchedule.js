const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const TelegramSchedule = sequelize.define('TelegramSchedule', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  status: { type: DataTypes.ENUM('pending', 'running', 'completed', 'failed'), allowNull: false, defaultValue: 'pending' },
  type: { type: DataTypes.ENUM('campaign'), allowNull: false, defaultValue: 'campaign' },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: true },
  result: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: 'telegram_schedules',
  timestamps: true,
  indexes: [
    { fields: ['userId', 'status'] },
    { fields: ['scheduledAt'] }
  ]
});

module.exports = { TelegramSchedule };






