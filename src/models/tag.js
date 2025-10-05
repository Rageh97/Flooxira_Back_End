const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

// Tag model for categorizing contacts/chats per user
const Tag = sequelize.define('Tag', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  name: { type: DataTypes.STRING(100), allowNull: false },
  color: { type: DataTypes.STRING(20), allowNull: true }
}, {
  tableName: 'tags',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { unique: true, fields: ['userId', 'name'] }
  ]
});

// ContactTag model maps a contact (by number) to a tag
const ContactTag = sequelize.define('ContactTag', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  tagId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'tags', key: 'id' }
  },
  contactNumber: { type: DataTypes.STRING(50), allowNull: false },
  contactName: { type: DataTypes.STRING(255), allowNull: true }
}, {
  tableName: 'contact_tags',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['tagId'] },
    { fields: ['contactNumber'] },
    { unique: true, fields: ['userId', 'tagId', 'contactNumber'] }
  ]
});

// Associations
User.hasMany(Tag, { foreignKey: 'userId' });
Tag.belongsTo(User, { foreignKey: 'userId' });

Tag.hasMany(ContactTag, { foreignKey: 'tagId', as: 'contacts' });
ContactTag.belongsTo(Tag, { foreignKey: 'tagId' });

User.hasMany(ContactTag, { foreignKey: 'userId' });
ContactTag.belongsTo(User, { foreignKey: 'userId' });

module.exports = { Tag, ContactTag };







