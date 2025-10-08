const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const SubscriptionRequest = sequelize.define('SubscriptionRequest', {
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
  planId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'plans',
      key: 'id'
    }
  },
  paymentMethod: {
    type: DataTypes.ENUM('usdt', 'coupon'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: false,
    defaultValue: 'pending'
  },
  // For USDT payments
  usdtWalletAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  receiptImage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // For coupon payments
  couponCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Additional info
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  adminNotes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  processedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  processedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'subscription_requests',
  timestamps: true
});

module.exports = { SubscriptionRequest };















