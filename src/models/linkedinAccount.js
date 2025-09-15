const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const LinkedInAccount = sequelize.define('LinkedInAccount', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  linkedinUserId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  profilePicture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  scope: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  lastSyncAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'LinkedInAccounts',
  timestamps: true
});

module.exports = { LinkedInAccount };




