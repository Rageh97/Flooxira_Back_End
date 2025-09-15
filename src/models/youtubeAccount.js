const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const crypto = require('../utils/crypto');

const YouTubeAccount = sequelize.define('YouTubeAccount', {
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
  googleUserId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  channelId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  channelTitle: {
    type: DataTypes.STRING,
    allowNull: true
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
  tableName: 'youtube_accounts',
  timestamps: true
});

module.exports = YouTubeAccount;












