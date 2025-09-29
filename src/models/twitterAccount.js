const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const crypto = require('../utils/crypto');

const TwitterAccount = sequelize.define('TwitterAccount', {
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
  twitterUserId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('accessToken');
      return rawValue ? crypto.decrypt(rawValue) : null;
    },
    set(value) {
      if (value) this.setDataValue('accessToken', crypto.encrypt(value));
      else this.setDataValue('accessToken', null);
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
      if (value) this.setDataValue('refreshToken', crypto.encrypt(value));
      else this.setDataValue('refreshToken', null);
    }
  },
  expiresAt: {
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
  tableName: 'twitter_accounts',
  timestamps: true
});

module.exports = TwitterAccount;

