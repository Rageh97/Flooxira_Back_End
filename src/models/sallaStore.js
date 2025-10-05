const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const SallaStore = sequelize.define('SallaStore', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  storeId: { type: DataTypes.STRING, allowNull: false, unique: true },
  storeName: { type: DataTypes.STRING, allowNull: true },
  webhookSecret: { type: DataTypes.STRING, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  tableName: 'salla_stores',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['storeId'] },
    { fields: ['userId'] }
  ]
});

User.hasMany(SallaStore, { foreignKey: 'userId' });
SallaStore.belongsTo(User, { foreignKey: 'userId' });

module.exports = { SallaStore };










