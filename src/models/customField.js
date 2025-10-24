const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const CustomField = sequelize.define('CustomField', {
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
  label: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('text', 'number', 'date', 'email', 'phone', 'select', 'textarea'),
    allowNull: false,
    defaultValue: 'text'
  },
  required: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  options: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null
  },
  placeholder: {
    type: DataTypes.STRING,
    allowNull: true
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  tableName: 'custom_fields',
  timestamps: true
});

// Define associations
CustomField.associate = function(models) {
  CustomField.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
};

module.exports = { CustomField };


