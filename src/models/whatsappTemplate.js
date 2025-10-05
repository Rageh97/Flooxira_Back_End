const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

// WhatsappTemplate model for storing template configurations
const WhatsappTemplate = sequelize.define('WhatsappTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  name: { type: DataTypes.STRING(100), allowNull: false },
  headerText: { type: DataTypes.TEXT, allowNull: true },
  footerText: { type: DataTypes.TEXT, allowNull: true },
  triggerKeywords: { type: DataTypes.TEXT, allowNull: true }, // JSON array of keywords
  displayOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'whatsapp_templates',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['userId', 'isActive'] }
  ]
});

// WhatsappTemplateButton model for storing template buttons
const WhatsappTemplateButton = sequelize.define('WhatsappTemplateButton', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  templateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'whatsapp_templates', key: 'id' }
  },
  buttonText: { type: DataTypes.STRING(100), allowNull: false },
  buttonType: { 
    type: DataTypes.ENUM('reply', 'url', 'phone', 'nested'), 
    defaultValue: 'reply',
    allowNull: false 
  },
  responseText: { type: DataTypes.TEXT, allowNull: true },
  url: { type: DataTypes.STRING(500), allowNull: true },
  phoneNumber: { type: DataTypes.STRING(50), allowNull: true },
  parentButtonId: { 
    type: DataTypes.INTEGER, 
    allowNull: true,
    references: { model: 'whatsapp_template_buttons', key: 'id' }
  },
  displayOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'whatsapp_template_buttons',
  timestamps: true,
  indexes: [
    { fields: ['templateId'] },
    { fields: ['templateId', 'isActive'] },
    { fields: ['parentButtonId'] }
  ]
});

// Associations
User.hasMany(WhatsappTemplate, { foreignKey: 'userId' });
WhatsappTemplate.belongsTo(User, { foreignKey: 'userId' });

WhatsappTemplate.hasMany(WhatsappTemplateButton, { 
  foreignKey: 'templateId', 
  as: 'buttons' 
});
WhatsappTemplateButton.belongsTo(WhatsappTemplate, { foreignKey: 'templateId' });

// Self-referencing association for nested buttons
WhatsappTemplateButton.hasMany(WhatsappTemplateButton, { 
  foreignKey: 'parentButtonId', 
  as: 'childButtons' 
});
WhatsappTemplateButton.belongsTo(WhatsappTemplateButton, { 
  foreignKey: 'parentButtonId', 
  as: 'parentButton' 
});

module.exports = { WhatsappTemplate, WhatsappTemplateButton };



