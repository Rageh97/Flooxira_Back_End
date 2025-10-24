const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Service = sequelize.define('Service', {
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
    },
    onDelete: 'CASCADE',
    comment: 'معرف المستخدم صاحب الخدمة'
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'عنوان الخدمة'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'وصف الخدمة'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'سعر الخدمة'
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'SAR',
    comment: 'العملة'
  },
  purchaseLink: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'رابط شراء الخدمة'
  },
  image: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'صورة الخدمة'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'حالة الخدمة (نشط/غير نشط)'
  },
  viewsCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'عدد المشاهدات'
  },
  clicksCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'عدد الضغطات على رابط الشراء'
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'تصنيف الخدمة'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'وسوم الخدمة'
  }
}, {
  tableName: 'services',
  timestamps: true,
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['isActive']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = { Service };
