const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const { User } = require('./user');

// TelegramTemplate model for storing template configurations
const TelegramTemplate = sequelize.define('TelegramTemplate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  name: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  headerText: { type: DataTypes.TEXT, allowNull: true },
  bodyText: { type: DataTypes.TEXT, allowNull: false },
  footerText: { type: DataTypes.TEXT, allowNull: true },
  triggerKeywords: { type: DataTypes.TEXT, allowNull: true }, // JSON array of keywords
  displayOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  templateType: { 
    type: DataTypes.ENUM('text', 'media', 'poll', 'quiz'), 
    defaultValue: 'text' 
  },
  mediaType: { 
    type: DataTypes.ENUM('photo', 'video', 'document', 'audio', 'voice'), 
    allowNull: true 
  },
  mediaUrl: { type: DataTypes.TEXT, allowNull: true },
  pollOptions: { type: DataTypes.TEXT, allowNull: true }, // JSON array for poll options
  pollType: { 
    type: DataTypes.ENUM('regular', 'quiz'), 
    allowNull: true 
  },
  correctAnswer: { type: DataTypes.INTEGER, allowNull: true }, // For quiz polls
  explanation: { type: DataTypes.TEXT, allowNull: true } // For quiz polls
}, {
  tableName: 'telegram_templates',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['userId', 'isActive'] },
    { fields: ['templateType'] }
  ]
});

// TelegramTemplateButton model for storing template buttons
const TelegramTemplateButton = sequelize.define('TelegramTemplateButton', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  templateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'telegram_templates', key: 'id' }
  },
  parentButtonId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'telegram_template_buttons', key: 'id' }
  },
  text: { type: DataTypes.STRING(64), allowNull: false },
  buttonType: { 
    type: DataTypes.ENUM('url', 'callback', 'switch_inline', 'switch_inline_current', 'web_app'), 
    defaultValue: 'callback' 
  },
  url: { type: DataTypes.TEXT, allowNull: true },
  callbackData: { type: DataTypes.STRING(64), allowNull: true },
  webAppUrl: { type: DataTypes.TEXT, allowNull: true },
  switchInlineQuery: { type: DataTypes.TEXT, allowNull: true },
  displayOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'telegram_template_buttons',
  timestamps: true,
  indexes: [
    { fields: ['templateId'] },
    { fields: ['parentButtonId'] },
    { fields: ['templateId', 'displayOrder'] }
  ]
});

// TelegramTemplateVariable model for storing template variables
const TelegramTemplateVariable = sequelize.define('TelegramTemplateVariable', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  templateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'telegram_templates', key: 'id' }
  },
  variableName: { type: DataTypes.STRING(50), allowNull: false },
  variableType: { 
    type: DataTypes.ENUM('text', 'number', 'date', 'boolean', 'select'), 
    defaultValue: 'text' 
  },
  defaultValue: { type: DataTypes.TEXT, allowNull: true },
  isRequired: { type: DataTypes.BOOLEAN, defaultValue: false },
  options: { type: DataTypes.TEXT, allowNull: true }, // JSON array for select options
  placeholder: { type: DataTypes.STRING(100), allowNull: true },
  displayOrder: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'telegram_template_variables',
  timestamps: true,
  indexes: [
    { fields: ['templateId'] },
    { fields: ['templateId', 'displayOrder'] }
  ]
});

// TelegramTemplateUsage model for tracking template usage
const TelegramTemplateUsage = sequelize.define('TelegramTemplateUsage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  templateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'telegram_templates', key: 'id' }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  chatId: { type: DataTypes.STRING(50), allowNull: false },
  messageId: { type: DataTypes.STRING(50), allowNull: true },
  variables: { type: DataTypes.TEXT, allowNull: true }, // JSON object of used variables
  success: { type: DataTypes.BOOLEAN, defaultValue: true },
  errorMessage: { type: DataTypes.TEXT, allowNull: true },
  sentAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'telegram_template_usage',
  timestamps: true,
  indexes: [
    { fields: ['templateId'] },
    { fields: ['userId'] },
    { fields: ['chatId'] },
    { fields: ['sentAt'] }
  ]
});

// Define associations
TelegramTemplate.belongsTo(User, { foreignKey: 'userId', as: 'user' });
TelegramTemplate.hasMany(TelegramTemplateButton, { foreignKey: 'templateId', as: 'buttons' });
TelegramTemplate.hasMany(TelegramTemplateVariable, { foreignKey: 'templateId', as: 'variables' });
TelegramTemplate.hasMany(TelegramTemplateUsage, { foreignKey: 'templateId', as: 'usage' });

TelegramTemplateButton.belongsTo(TelegramTemplate, { foreignKey: 'templateId', as: 'template' });
TelegramTemplateButton.belongsTo(TelegramTemplateButton, { foreignKey: 'parentButtonId', as: 'parentButton' });
TelegramTemplateButton.hasMany(TelegramTemplateButton, { foreignKey: 'parentButtonId', as: 'ChildButtons' });

TelegramTemplateVariable.belongsTo(TelegramTemplate, { foreignKey: 'templateId', as: 'template' });

TelegramTemplateUsage.belongsTo(TelegramTemplate, { foreignKey: 'templateId', as: 'template' });
TelegramTemplateUsage.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = {
  TelegramTemplate,
  TelegramTemplateButton,
  TelegramTemplateVariable,
  TelegramTemplateUsage
};
