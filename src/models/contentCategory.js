const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const ContentCategory = sequelize.define('ContentCategory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'content_categories',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['name'] }
  ]
});

User.hasMany(ContentCategory, { foreignKey: 'userId' });
ContentCategory.belongsTo(User, { foreignKey: 'userId' });

module.exports = { ContentCategory };


