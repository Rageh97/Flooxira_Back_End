const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const crypto = require('../utils/crypto');

const TikTokAccount = sequelize.define('TikTokAccount', {
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
  tiktokUserId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  profilePicture: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  followerCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  followingCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  videoCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      const rawValue = this.getDataValue('accessToken');
      return rawValue ? crypto.decrypt(rawValue) : null;
    },
    set(value) {
      this.setDataValue('accessToken', crypto.encrypt(value));
    }
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('refreshToken');
      return rawValue ? crypto.decrypt(rawValue) : null;
    },
    set(value) {
      this.setDataValue('refreshToken', crypto.encrypt(value));
    }
  },
  expiresAt: {
    type: DataTypes.DATE,
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
  tableName: 'tiktok_accounts',
  timestamps: true
});

module.exports = TikTokAccount;
