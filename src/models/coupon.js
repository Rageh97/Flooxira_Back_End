const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Coupon = sequelize.define('Coupon', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  code: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  customSuffix: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'كلمة مميزة تضاف في آخر رمز الكوبون'
  },
  discountKeyword: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'كلمة الخصم التي يمكن إضافتها للكوبون'
  },
  discountKeywordValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'قيمة الخصم عند إضافة كلمة الخصم'
  },
  planId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'plans',
      key: 'id'
    }
  },
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed', 'bonus_days'),
    allowNull: false,
    defaultValue: 'percentage',
    comment: 'نوع الخصم: نسبة مئوية، قيمة ثابتة، أو أيام إضافية'
  },
  discountValue: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'قيمة الخصم (نسبة أو مبلغ ثابت)'
  },
  bonusDays: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'عدد الأيام الإضافية التي يمنحها الكوبون'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  usedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  usedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  maxUses: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'الحد الأقصى لعدد مرات استخدام الكوبون (null = غير محدود)'
  },
  currentUses: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'عدد مرات الاستخدام الحالية'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'coupons',
  timestamps: true
});

module.exports = { Coupon };
















