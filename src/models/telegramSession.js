const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const TelegramSession = sequelize.define('TelegramSession', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  sessionString: { type: DataTypes.TEXT, allowNull: true },
  phoneNumber: { type: DataTypes.STRING(32), allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'telegram_sessions',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['isActive'] }
  ]
});

User.hasMany(TelegramSession, { foreignKey: 'userId' });
TelegramSession.belongsTo(User, { foreignKey: 'userId' });

module.exports = { TelegramSession };

