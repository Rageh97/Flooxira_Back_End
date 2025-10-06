const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const BotSettings = sequelize.define('BotSettings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Auto-reply Template Settings
  autoReplyEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  autoReplyTemplateId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    // Removed foreign key constraint to avoid save errors when templates are recreated
  },
  // Removed button color preference
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE'
  },
  // AI Model Settings
  aiProvider: {
    type: DataTypes.ENUM('openai', 'gemini', 'both'),
    defaultValue: 'both',
    allowNull: false
  },
  openaiModel: {
    type: DataTypes.STRING,
    defaultValue: 'gpt-4o-mini',
    allowNull: false
  },
  geminiModel: {
    type: DataTypes.STRING,
    defaultValue: 'gemini-2.5-flash',
    allowNull: false
  },
  temperature: {
    type: DataTypes.FLOAT,
    defaultValue: 0.7,
    allowNull: false,
    validate: {
      min: 0,
      max: 2
    }
  },
  maxTokens: {
    type: DataTypes.INTEGER,
    defaultValue: 1000,
    allowNull: false,
    validate: {
      min: 100,
      max: 4000
    }
  },
  
  // Personality Settings
  personality: {
    type: DataTypes.ENUM('professional', 'friendly', 'casual', 'formal', 'marketing', 'custom'),
    defaultValue: 'marketing',
    allowNull: false
  },
  language: {
    type: DataTypes.ENUM('arabic', 'english', 'both'),
    defaultValue: 'arabic',
    allowNull: false
  },
  dialect: {
    type: DataTypes.ENUM('saudi', 'egyptian', 'lebanese', 'emirati', 'kuwaiti', 'qatari', 'bahraini', 'omani', 'jordanian', 'palestinian', 'syrian', 'iraqi', 'standard'),
    defaultValue: 'saudi',
    allowNull: false
  },
  tone: {
    type: DataTypes.ENUM('formal', 'informal', 'mixed'),
    defaultValue: 'informal',
    allowNull: false
  },
  
  // Response Settings
  responseLength: {
    type: DataTypes.ENUM('short', 'medium', 'long'),
    defaultValue: 'medium',
    allowNull: false
  },
  includeEmojis: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  includeGreetings: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  includeFarewells: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  
  // Business Settings
  businessName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  businessType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  businessDescription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  targetAudience: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Custom Prompts
  systemPrompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  greetingPrompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  farewellPrompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  salesPrompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  objectionHandlingPrompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Advanced Settings
  enableContextMemory: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  contextWindow: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    allowNull: false,
    validate: {
      min: 5,
      max: 50
    }
  },
  enableFallback: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  fallbackMessage: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  
  // Analytics Settings
  trackConversations: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  trackPerformance: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  
  // Status
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'bot_settings',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId']
    }
  ]
});

// Associations
const { User } = require('./user');
BotSettings.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(BotSettings, { foreignKey: 'userId', as: 'botSettings' });

module.exports = { BotSettings };
