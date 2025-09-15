const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const crypto = require('../utils/crypto');

const WhatsAppBusinessAccount = sequelize.define('WhatsAppBusinessAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  wabaId: { type: DataTypes.STRING, allowNull: true },
  phoneNumberId: { type: DataTypes.STRING, allowNull: false },
  phoneNumber: { type: DataTypes.STRING, allowNull: true },
  verifyToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const raw = this.getDataValue('verifyToken');
      return raw ? crypto.decrypt(raw) : null;
    },
    set(v) {
      this.setDataValue('verifyToken', crypto.encrypt(v));
    }
  },
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
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  lastSyncAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'whatsapp_business_accounts',
  timestamps: true
});

module.exports = WhatsAppBusinessAccount;











