const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'plans',
      key: 'id'
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  usedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'coupons',
  timestamps: true
});

module.exports = { Coupon };















