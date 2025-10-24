const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const CustomerInteraction = sequelize.define('CustomerInteraction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  type: {
    type: DataTypes.ENUM('call', 'email', 'meeting', 'message', 'support', 'payment', 'other'),
    allowNull: false
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  outcome: {
    type: DataTypes.ENUM('positive', 'neutral', 'negative', 'pending'),
    allowNull: false,
    defaultValue: 'neutral'
  },
  followUpRequired: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  followUpDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  attachments: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  }
}, {
  tableName: 'customer_interactions',
  timestamps: true
});

// Define associations
CustomerInteraction.associate = function(models) {
  CustomerInteraction.belongsTo(models.Customer, {
    foreignKey: 'customerId',
    as: 'customer'
  });
  
  CustomerInteraction.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
};


module.exports = { CustomerInteraction };
