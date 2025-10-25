const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(120), allowNull: true },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
  phone: { type: DataTypes.STRING(20), allowNull: true },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  emailVerifiedAt: { type: DataTypes.DATE, allowNull: true },
  role: { 
    type: DataTypes.STRING, 
    allowNull: false, 
    defaultValue: 'user',
    validate: {
      isIn: [['user', 'admin']]
    }
  },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  botPaused: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  botPausedUntil: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'users',
  timestamps: true,
  indexes: [{ unique: true, fields: ['email'] }],
});

module.exports = { User };


