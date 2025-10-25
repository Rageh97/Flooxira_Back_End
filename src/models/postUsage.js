const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const PostUsage = sequelize.define('PostUsage', {
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
      isIn: [['facebook', 'instagram', 'twitter', 'linkedin', 'pinterest', 'tiktok', 'youtube']]
    }
  },
  postType: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'published',
    validate: {
      isIn: [['published', 'scheduled']]
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
  tableName: 'post_usage',
  timestamps: true,
  indexes: [
    { fields: ['userId', 'platform', 'month', 'year'] },
    { fields: ['userId'] },
    { fields: ['platform'] }
  ]
});

module.exports = { PostUsage };





