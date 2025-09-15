const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const crypto = require('../utils/crypto');

const SallaAccount = sequelize.define('SallaAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  sallaStoreId: { type: DataTypes.STRING, allowNull: true },
  storeName: { type: DataTypes.STRING, allowNull: true },
  ownerEmail: { type: DataTypes.STRING, allowNull: true },
  scope: { type: DataTypes.TEXT, allowNull: true },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      const raw = this.getDataValue('accessToken');
      return raw ? crypto.decrypt(raw) : null;
    },
    set(v) {
      this.setDataValue('accessToken', crypto.encrypt(v));
    }
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('refreshToken');
      return raw ? crypto.decrypt(raw) : null;
    },
    set(v) {
      this.setDataValue('refreshToken', crypto.encrypt(v));
    }
  },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  lastSyncAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'salla_accounts',
  timestamps: true
});

module.exports = SallaAccount;




