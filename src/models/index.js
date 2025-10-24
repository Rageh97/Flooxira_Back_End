// Export all models for easy importing
const { User } = require('./user');
const { Plan } = require('./plan');
const { UserSubscription } = require('./userSubscription');
const { Customer } = require('./customer');
const { CustomerInteraction } = require('./customerInteraction');
const { CustomerCategory } = require('./customerCategory');
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
const TelegramGroup = require('./telegramGroup');
const { Tutorial } = require('./tutorial');
const { TwitterAccount } = require('./twitterAccount');
const { WhatsAppChat } = require('./whatsappChat');
const { WhatsAppSchedule } = require('./whatsappSchedule');
const { WhatsAppSession } = require('./whatsappSession');
const { WhatsAppTemplate } = require('./whatsappTemplate');
const { YouTubeAccount } = require('./youtubeAccount');
const { TikTokAccount } = require('./tiktokAccount');
const { Reminder } = require('./reminder');
const { Employee } = require('./employee');

module.exports = {
  User,
  Plan,
  UserSubscription,
  Customer,
  CustomerInteraction,
  CustomerCategory,
  SubscriptionRequest,
  Coupon,
  Post,
  Tag,
  BotData,
  BotField,
  BotSettings,
  ContentCategory,
  ContentItem,
  FacebookAccount,
  KnowledgeBase,
  LinkedInAccount,
  MessageUsage,
  PinterestAccount,
  PlatformCredential,
  Review,
  SallaEvent,
  SallaStore,
  TelegramBotAccount,
  TelegramChat,
  TelegramChatTag,
  TelegramSchedule,
  TelegramTemplate,
  TelegramGroup,
  Tutorial,
  TwitterAccount,
  WhatsAppChat,
  WhatsAppSchedule,
  WhatsAppSession,
  WhatsAppTemplate,
  YouTubeAccount,
  TikTokAccount,
  Reminder,
  Employee
};

