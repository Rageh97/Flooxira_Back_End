// Initialize all model associations
const { User } = require('./user');
const { Plan } = require('./plan');
const { UserSubscription } = require('./userSubscription');
const { Customer } = require('./customer');
const { CustomerInteraction } = require('./customerInteraction');
const { CustomerCategory } = require('./customerCategory');
const { CustomField } = require('./customField');
const { SubscriptionRequest } = require('./subscriptionRequest');
const { Coupon } = require('./coupon');
const { Post } = require('./post');
const { Tag } = require('./tag');
const { BotData } = require('./botData');
const { BotField } = require('./botField');
const { BotSettings } = require('./botSettings');
const { ContentCategory } = require('./contentCategory');
const { ContentItem } = require('./contentItem');
const { FacebookAccount } = require('./facebookAccount');
const { KnowledgeBase } = require('./knowledgeBase');
const { LinkedInAccount } = require('./linkedinAccount');
const { MessageUsage } = require('./messageUsage');
const { PinterestAccount } = require('./pinterestAccount');
const { PlatformCredential } = require('./platformCredential');
const { Review } = require('./review');
const { SallaEvent } = require('./sallaEvent');
const { SallaStore } = require('./sallaStore');
const { TelegramBotAccount } = require('./telegramBotAccount');
const { TelegramChat } = require('./telegramChat');
const { TelegramChatTag } = require('./telegramChatTag');
const { TelegramSchedule } = require('./telegramSchedule');
const { TelegramTemplate } = require('./telegramTemplate');
const { Tutorial } = require('./tutorial');
const { TwitterAccount } = require('./twitterAccount');
const { WhatsAppChat } = require('./whatsappChat');
const { WhatsAppSchedule } = require('./whatsappSchedule');
const { WhatsAppSession } = require('./whatsappSession');
const { WhatsAppTemplate } = require('./whatsappTemplate');
const { YouTubeAccount } = require('./youtubeAccount');
const { TikTokAccount } = require('./tiktokAccount');
const { Service } = require('./service');
const { Employee } = require('./employee');

// Define associations
function initializeAssociations() {
  // User associations
  User.hasMany(UserSubscription, { foreignKey: 'userId', as: 'subscriptions' });
  User.hasMany(Customer, { foreignKey: 'userId', as: 'customers' });
  User.hasMany(CustomerInteraction, { foreignKey: 'userId', as: 'interactions' });
  User.hasMany(CustomerCategory, { foreignKey: 'userId', as: 'customerCategories' });
  User.hasMany(CustomField, { foreignKey: 'userId', as: 'customFields' });
  User.hasMany(SubscriptionRequest, { foreignKey: 'userId', as: 'subscriptionRequests' });
  User.hasMany(Post, { foreignKey: 'userId', as: 'posts' });
  User.hasMany(Review, { foreignKey: 'userId', as: 'reviews' });
  User.hasMany(Service, { foreignKey: 'userId', as: 'services' });
  User.hasMany(Employee, { foreignKey: 'ownerId', as: 'employees' });

  // Plan associations
  Plan.hasMany(UserSubscription, { foreignKey: 'planId', as: 'subscriptions' });
  Plan.hasMany(Coupon, { foreignKey: 'planId', as: 'coupons' });

  // UserSubscription associations
  UserSubscription.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  UserSubscription.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
  UserSubscription.belongsTo(SubscriptionRequest, { foreignKey: 'subscriptionRequestId', as: 'subscriptionRequest' });

  // Customer associations
  Customer.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Customer.belongsTo(CustomerCategory, { foreignKey: 'categoryId', as: 'category' });
  Customer.hasMany(CustomerInteraction, { foreignKey: 'customerId', as: 'interactions' });

  // CustomerCategory associations
  CustomerCategory.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  CustomerCategory.hasMany(Customer, { foreignKey: 'categoryId', as: 'customers' });

  // CustomField associations
  CustomField.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // CustomerInteraction associations
  CustomerInteraction.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
  CustomerInteraction.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // SubscriptionRequest associations
  SubscriptionRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  SubscriptionRequest.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });
  SubscriptionRequest.hasOne(UserSubscription, { foreignKey: 'subscriptionRequestId', as: 'subscription' });

  // Coupon associations
  Coupon.belongsTo(Plan, { foreignKey: 'planId', as: 'plan' });

  // Post associations
  Post.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Review associations
  Review.belongsTo(User, { foreignKey: 'userId', as: 'user' });
  Review.belongsTo(User, { foreignKey: 'processedBy', as: 'processedByUser' });

  // Service associations
  Service.belongsTo(User, { foreignKey: 'userId', as: 'user' });

  // Employee associations
  Employee.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

  console.log('✅ Model associations initialized successfully');
}

module.exports = { initializeAssociations };

