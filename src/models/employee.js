const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');
const bcrypt = require('bcryptjs');

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  passwordHash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  ownerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  permissions: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {
      // المنصات الاجتماعية
      platforms: [], // ['facebook', 'instagram', 'twitter', 'linkedin', 'pinterest', 'tiktok', 'youtube']
      
      // إدارة الواتساب
      canManageWhatsApp: false,
      whatsappMessagesPerMonth: 0,
      
      // إدارة التليجرام
      canManageTelegram: false,
      
      // تكامل سلة
      canSallaIntegration: false,
      
      // إدارة المحتوى
      canManageContent: false,
      
      // إدارة العملاء
      canManageCustomers: false,
      
      // تسويق الخدمات
      canMarketServices: false,
      maxServices: 0,
      
      // إدارة الموظفين (للموظفين فقط)
      canManageEmployees: false,
      maxEmployees: 0
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  emailVerifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'employees',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['email'] },
    { fields: ['ownerId'] },
    { fields: ['isActive'] }
  ],
  hooks: {
    beforeCreate: async (employee) => {
      if (employee.passwordHash) {
        employee.passwordHash = await bcrypt.hash(employee.passwordHash, 10);
      }
    },
    beforeUpdate: async (employee) => {
      if (employee.changed('passwordHash') && employee.passwordHash) {
        employee.passwordHash = await bcrypt.hash(employee.passwordHash, 10);
      }
    }
  }
});

Employee.prototype.validPassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = { Employee };
