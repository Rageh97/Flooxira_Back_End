const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const UserSubscription = sequelize.define('UserSubscription', {
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
  subscriptionRequestId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'subscription_requests',
      key: 'id'
    }
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'active',
    validate: {
      isIn: [['active', 'expired', 'cancelled']]
    }
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  autoRenew: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  // Coupon/Discount information
  couponCode: {
    type: DataTypes.STRING,
    allowNull: true
  },
  discountType: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isIn: [['percentage', 'fixed', 'bonus_days']]
    }
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  finalPriceCents: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Final price after discount in cents'
  }
}, {
  tableName: 'user_subscriptions',
  timestamps: true
});

// Define associations
UserSubscription.associate = function(models) {
  UserSubscription.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
  
  UserSubscription.belongsTo(models.Plan, {
    foreignKey: 'planId',
    as: 'plan'
  });
  
  UserSubscription.belongsTo(models.SubscriptionRequest, {
    foreignKey: 'subscriptionRequestId',
    as: 'subscriptionRequest'
  });
};

module.exports = { UserSubscription };



