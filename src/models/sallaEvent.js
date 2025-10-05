const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');
const { SallaStore } = require('./sallaStore');

const SallaEvent = sequelize.define('SallaEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
  storeId: { type: DataTypes.STRING, allowNull: true },
  sallaStoreId: { type: DataTypes.INTEGER, allowNull: true, references: { model: 'salla_stores', key: 'id' } },
  eventType: { type: DataTypes.STRING, allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  signatureValid: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'salla_events',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['storeId'] },
    { fields: ['eventType'] }
  ]
});

User.hasMany(SallaEvent, { foreignKey: 'userId' });
SallaEvent.belongsTo(User, { foreignKey: 'userId' });

SallaStore.hasMany(SallaEvent, { foreignKey: 'sallaStoreId' });
SallaEvent.belongsTo(SallaStore, { foreignKey: 'sallaStoreId' });

module.exports = { SallaEvent };










