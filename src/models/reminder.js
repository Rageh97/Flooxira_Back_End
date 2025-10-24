const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');
const { ContentItem } = require('./contentItem');

const Reminder = sequelize.define('Reminder', {
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
  contentItemId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'content_items', key: 'id' }
  },
  whatsappNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'رقم الواتساب لإرسال التذكير'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'رسالة التذكير'
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'موعد النشر الأصلي'
  },
  reminderTime1: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'موعد التذكير الأول (قبل ساعتين)'
  },
  reminderTime2: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'موعد التذكير الثاني (قبل ساعة)'
  },
  status: {
    type: DataTypes.ENUM('active', 'sent', 'cancelled'),
    defaultValue: 'active',
    comment: 'حالة التذكير'
  },
  sentAt1: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'وقت إرسال التذكير الأول'
  },
  sentAt2: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'وقت إرسال التذكير الثاني'
  }
}, {
  tableName: 'reminders',
  timestamps: true,
  comment: 'جدول التذكيرات'
});

// Associations
Reminder.belongsTo(User, { foreignKey: 'userId', as: 'user', onDelete: 'CASCADE' });
Reminder.belongsTo(ContentItem, { foreignKey: 'contentItemId', as: 'contentItem', onDelete: 'CASCADE' });

module.exports = { Reminder };





