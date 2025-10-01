const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const BotField = sequelize.define('BotField', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  fieldName: { type: DataTypes.STRING(120), allowNull: false },
  fieldType: { type: DataTypes.ENUM('string', 'number', 'boolean', 'date', 'text'), allowNull: false, defaultValue: 'string' }
}, {
  tableName: 'bot_fields',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { unique: true, fields: ['userId', 'fieldName'] }
  ]
});

User.hasMany(BotField, { foreignKey: 'userId' });
BotField.belongsTo(User, { foreignKey: 'userId' });

module.exports = { BotField };


