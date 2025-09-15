const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

const WhatsappSession = sequelize.define('WhatsappSession', {
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
  clientId: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  sessionData: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'whatsapp_sessions',
  timestamps: true
});

User.hasMany(WhatsappSession, { foreignKey: 'userId' });
WhatsappSession.belongsTo(User, { foreignKey: 'userId' });

module.exports = { WhatsappSession };












