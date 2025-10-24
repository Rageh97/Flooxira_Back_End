const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');
const { ContentCategory } = require('./contentCategory');

const ContentItem = sequelize.define('ContentItem', {
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
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'content_categories', key: 'id' }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  attachments: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  status: {
    type: DataTypes.ENUM('draft', 'ready'),
    allowNull: false,
    defaultValue: 'draft'
  },
  // Optional preselection for scheduling
  platforms: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: []
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'content_items',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['categoryId'] },
    { fields: ['status'] }
  ]
});

User.hasMany(ContentItem, { foreignKey: 'userId', onDelete: 'CASCADE' });
ContentItem.belongsTo(User, { foreignKey: 'userId' });
ContentCategory.hasMany(ContentItem, { foreignKey: 'categoryId', onDelete: 'CASCADE' });
ContentItem.belongsTo(ContentCategory, { foreignKey: 'categoryId' });

// Add association for Reminders (will be set up in reminder.js)
// ContentItem.hasMany(Reminder, { foreignKey: 'contentItemId', onDelete: 'CASCADE' });

module.exports = { ContentItem };










