const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const PinterestAccount = sequelize.define('PinterestAccount', {
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
  pinterestUserId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: true
  },
  fullName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  refreshToken: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  profileImageUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  accountType: {
    type: DataTypes.ENUM('personal', 'business'),
    defaultValue: 'personal'
  }
}, {
  tableName: 'PinterestAccounts',
  timestamps: true
});

// Define associations to ensure proper FK constraints and sync order
User.hasOne(PinterestAccount, { foreignKey: 'userId' });
PinterestAccount.belongsTo(User, { foreignKey: 'userId' });

module.exports = { PinterestAccount };
