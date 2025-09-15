const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  priceCents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  interval: {
    type: DataTypes.ENUM('monthly', 'yearly'),
    allowNull: false,
    defaultValue: 'monthly'
  },
  features: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'plans',
  timestamps: true
});

module.exports = { Plan };




