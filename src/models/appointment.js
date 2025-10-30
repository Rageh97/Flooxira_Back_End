const { DataTypes } = require('sequelize');
const { sequelize } = require('../sequelize');

const Appointment = sequelize.define('Appointment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  customerName: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'اسم العميل'
  },
  customerPhone: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'رقم هاتف العميل'
  },
  customerEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'بريد العميل الإلكتروني'
  },
  serviceType: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'نوع الخدمة المطلوبة'
  },
  serviceDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'وصف تفصيلي للخدمة'
  },
  appointmentDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'تاريخ الموعد'
  },
  appointmentTime: {
    type: DataTypes.TIME,
    allowNull: false,
    comment: 'وقت الموعد'
  },
  duration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60,
    comment: 'مدة الموعد بالدقائق'
  },
  status: {
    type: DataTypes.ENUM('pending', 'confirmed', 'cancelled', 'completed', 'no_show'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'حالة الموعد'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    allowNull: false,
    defaultValue: 'medium',
    comment: 'أولوية الموعد'
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'مكان الموعد'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'ملاحظات إضافية'
  },
  reminderSent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'تم إرسال التذكير'
  },
  reminderSentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'وقت إرسال التذكير'
  },
  source: {
    type: DataTypes.ENUM('whatsapp', 'website', 'phone', 'walk_in', 'other'),
    allowNull: false,
    defaultValue: 'whatsapp',
    comment: 'مصدر طلب الموعد'
  },
  assignedTo: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    },
    comment: 'المسؤول عن الموعد'
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'سعر الخدمة'
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'paid', 'partial', 'refunded'),
    allowNull: false,
    defaultValue: 'pending',
    comment: 'حالة الدفع'
  },
  followUpDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'تاريخ المتابعة'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'علامات تصنيف الموعد'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'بيانات إضافية'
  }
}, {
  tableName: 'appointments',
  timestamps: true,
  indexes: [
    {
      fields: ['userId', 'appointmentDate']
    },
    {
      fields: ['customerPhone']
    },
    {
      fields: ['status']
    },
    {
      fields: ['appointmentDate', 'appointmentTime']
    }
  ]
});

module.exports = { Appointment };



