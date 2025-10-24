const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Tutorial = sequelize.define('Tutorial', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  youtubeUrl: {
    type: DataTypes.STRING(500),
    allowNull: false,
    validate: {
      isUrl: true
    }
  },
  youtubeVideoId: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  thumbnailUrl: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER, // in seconds
    allowNull: true
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    defaultValue: 'عام'
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  views: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'tutorials',
  timestamps: true
});

module.exports = { Tutorial };













