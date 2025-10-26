const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Plan = sequelize.define('Plan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  priceCents: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  interval: {
    type: DataTypes.ENUM('monthly', 'yearly'),
    allowNull: false,
    defaultValue: 'monthly'
  },
  features: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  permissions: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      // المنصات الاجتماعية المسموحة
      platforms: [], // ['facebook', 'instagram', 'twitter', 'linkedin', 'pinterest', 'tiktok', 'youtube']
      
      // عدد المنشورات الشهرية
      monthlyPosts: 10, // عدد البوستات المسموح شهرياً
      
      // إدارة الواتساب والتليجرام
      canManageWhatsApp: false, // إمكانية إدارة الواتساب
      whatsappMessagesPerMonth: 0, // عدد رسائل الواتساب شهرياً
      canManageTelegram: false, // إمكانية إدارة التليجرام
      
      // تكامل سلة
      canSallaIntegration: false, // إمكانية تكامل سلة
      
      // إدارة المحتوى
      canManageContent: false, // إمكانية إدارة المحتوى
      
      // إدارة العملاء
      canManageCustomers: false, // إمكانية إدارة العملاء
      
      // تسويق الخدمات
      canMarketServices: false, // إمكانية تسويق الخدمات
      maxServices: 0, // عدد الخدمات المسموح بها
      
      // إدارة الموظفين
      canManageEmployees: false, // إمكانية إدارة الموظفين
      maxEmployees: 0 // عدد الموظفين المسموح به (0 = غير محدود)
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'plans',
  timestamps: true
});

module.exports = { Plan };




