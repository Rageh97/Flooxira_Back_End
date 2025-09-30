const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const KnowledgeBase = sequelize.define('KnowledgeBase', {
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
  keyword: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  answer: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'knowledge_base',
  timestamps: true
});

User.hasMany(KnowledgeBase, { foreignKey: 'userId' });
KnowledgeBase.belongsTo(User, { foreignKey: 'userId' });

module.exports = { KnowledgeBase };













