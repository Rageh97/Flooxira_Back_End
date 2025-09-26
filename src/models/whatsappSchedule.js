const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const WhatsappSchedule = sequelize.define('WhatsappSchedule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.ENUM('groups', 'campaign'), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  mediaPath: { type: DataTypes.STRING(512), allowNull: true },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'running', 'completed', 'failed', 'cancelled'), allowNull: false, defaultValue: 'pending' },
  result: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'whatsapp_schedules',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['status', 'scheduledAt'] }
  ]
});

module.exports = { WhatsappSchedule };





