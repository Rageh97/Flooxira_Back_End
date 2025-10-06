const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

// Stores per-user OAuth app credentials per platform
// Example platform values: 'facebook', 'instagram', 'linkedin', 'pinterest', 'tiktok', 'youtube', 'twitter'
const PlatformCredential = sequelize.define('PlatformCredential', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  platform: {
    type: DataTypes.STRING,
    allowNull: false
  },
  clientId: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  clientSecret: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  redirectUri: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'platform_credentials',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['userId', 'platform'] }
  ]
});

module.exports = PlatformCredential;






