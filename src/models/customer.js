const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Customer = sequelize.define('Customer', {
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
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'customer_categories',
      key: 'id'
    }
  },
  productName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  subscriptionType: {
    type: DataTypes.STRING,
    allowNull: true
  },
  subscriptionStartDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  subscriptionEndDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  subscriptionStatus: {
    type: DataTypes.ENUM('active', 'inactive', 'expired'),
    allowNull: true,
    defaultValue: 'inactive'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  },
  customFields: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  purchasePrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  salePrice: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    defaultValue: 0
  },
  lastContactDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  nextFollowUpDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  socialMedia: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {}
  },
  invoiceImage: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'مسار صورة الفاتورة'
  },
  storeName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'اسم المتجر'
  }
}, {
  tableName: 'customers',
  timestamps: true
});

// Define associations
Customer.associate = function(models) {
  Customer.belongsTo(models.User, {
    foreignKey: 'userId',
    as: 'user'
  });
  
  Customer.belongsTo(models.CustomerCategory, {
    foreignKey: 'categoryId',
    as: 'category'
  });
  
  Customer.hasMany(models.CustomerInteraction, {
    foreignKey: 'customerId',
    as: 'interactions'
  });
};


module.exports = { Customer };
