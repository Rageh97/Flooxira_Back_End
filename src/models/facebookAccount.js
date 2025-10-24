const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const FacebookAccount = sequelize.define('FacebookAccount', {
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
  fbUserId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accessToken: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'User access token for getting pages list'
  },
  pageAccessToken: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Page-specific access token for publishing'
  },
  tokenExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  pageId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  groupId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  destination: {
    type: DataTypes.ENUM('page', 'group'),
    allowNull: true
  },
  // Instagram fields
  instagramId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  instagramUsername: {
    type: DataTypes.STRING,
    allowNull: true
  },
  instagramAccessToken: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'FacebookAccounts',
  timestamps: true
});

// Define associations to ensure proper FK constraints and sync order
User.hasOne(FacebookAccount, { foreignKey: 'userId' });
FacebookAccount.belongsTo(User, { foreignKey: 'userId' });

module.exports = FacebookAccount;


