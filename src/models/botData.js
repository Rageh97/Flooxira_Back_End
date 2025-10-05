const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const BotData = sequelize.define('BotData', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  data: { type: DataTypes.JSON, allowNull: false }
}, {
  tableName: 'bot_data',
  timestamps: true,
  indexes: [
    { fields: ['userId'] }
  ]
});

User.hasMany(BotData, { foreignKey: 'userId' });
BotData.belongsTo(User, { foreignKey: 'userId' });

module.exports = { BotData };








