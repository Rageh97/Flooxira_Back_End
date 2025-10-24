const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const CustomerCategory = sequelize.define('CustomerCategory', {
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
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  color: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: '#3B82F6'
  }
}, {
  tableName: 'customer_categories',
  timestamps: true
});

// Define associations
CustomerCategory.associate = function(models) {
  CustomerCategory.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
  
  CustomerCategory.hasMany(models.Customer, {
    foreignKey: 'categoryId',
    as: 'customers'
  });
};

module.exports = { CustomerCategory };








