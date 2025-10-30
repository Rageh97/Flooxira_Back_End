const { Appointment } = require('../models');
const { Op } = require('sequelize');
const XLSX = require('xlsx');
const moment = require('moment-timezone');
const notificationService = require('../services/appointmentNotificationService');

// إنشاء موعد جديد
async function createAppointment(req, res) {
  try {
    const userId = req.userId;
    const {
      customerName,
      customerPhone,
      customerEmail,
      serviceType,
      serviceDescription,
      appointmentDate,
      appointmentTime,
      duration = 60,
      priority = 'medium',
      location,
      notes,
      source = 'whatsapp',
      assignedTo,
      price,
      tags,
      metadata
    } = req.body;

    // التحقق من صحة البيانات المطلوبة
    if (!customerName || !customerPhone || !serviceType || !appointmentDate || !appointmentTime) {
      return res.status(400).json({
        success: false,
        message: 'البيانات المطلوبة: اسم العميل، رقم الهاتف، نوع الخدمة، التاريخ، والوقت'
      });
    }

    // التحقق من توفر الموعد
    const appointmentDateTime = new Date(`${appointmentDate}T${appointmentTime}`);
    const endTime = new Date(appointmentDateTime.getTime() + (duration * 60000));

    const conflictingAppointment = await Appointment.findOne({
      where: {
        userId,
        appointmentDate: {
          [Op.between]: [appointmentDateTime, endTime]
        },
        status: {
          [Op.in]: ['pending', 'confirmed']
        }
      }
    });

    if (conflictingAppointment) {
      return res.status(409).json({
        success: false,
        message: 'هذا الموعد متداخل مع موعد آخر موجود',
        conflictingAppointment: {
          id: conflictingAppointment.id,
          customerName: conflictingAppointment.customerName,
          appointmentDate: conflictingAppointment.appointmentDate,
          appointmentTime: conflictingAppointment.appointmentTime
        }
      });
    }

    // إنشاء الموعد
    const appointment = await Appointment.create({
      userId,
      customerName,
      customerPhone,
      customerEmail,
      serviceType,
      serviceDescription,
      appointmentDate: appointmentDateTime,
      appointmentTime,
      duration,
      priority,
      location,
      notes,
      source,
      assignedTo,
      price,
      tags: tags || [],
      metadata: metadata || {}
    });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء الموعد بنجاح',
      appointment
    });

  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في إنشاء الموعد',
      error: error.message
    });
  }
}

// الحصول على قائمة المواعيد
async function getAppointments(req, res) {
  try {
    const userId = req.userId;
    const {
      page = 1,
      limit = 20,
      status,
      priority,
      serviceType,
      dateFrom,
      dateTo,
      search,
      assignedTo
    } = req.query;

    const offset = (page - 1) * limit;
    const whereClause = { userId };

    // إضافة فلاتر البحث
    if (status) {
      whereClause.status = status;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    if (serviceType) {
      whereClause.serviceType = {
        [Op.iLike]: `%${serviceType}%`
      };
    }

    if (assignedTo) {
      whereClause.assignedTo = assignedTo;
    }

    if (dateFrom || dateTo) {
      whereClause.appointmentDate = {};
      if (dateFrom) {
        whereClause.appointmentDate[Op.gte] = new Date(dateFrom);
      }
      if (dateTo) {
        whereClause.appointmentDate[Op.lte] = new Date(dateTo);
      }
    }

    if (search) {
      whereClause[Op.or] = [
        { customerName: { [Op.iLike]: `%${search}%` } },
        { customerPhone: { [Op.iLike]: `%${search}%` } },
        { serviceType: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows: appointments } = await Appointment.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: require('../models').User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['appointmentDate', 'ASC'], ['appointmentTime', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      appointments,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب المواعيد',
      error: error.message
    });
  }
}

// الحصول على موعد محدد
async function getAppointment(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const appointment = await Appointment.findOne({
      where: { id, userId },
      include: [
        {
          model: require('../models').User,
          as: 'assignedUser',
          attributes: ['id', 'name', 'email']
        }
      ]
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    res.json({
      success: true,
      appointment
    });

  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب الموعد',
      error: error.message
    });
  }
}

// تحديث موعد
async function updateAppointment(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const updateData = req.body;

    const appointment = await Appointment.findOne({
      where: { id, userId }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    // التحقق من توفر الموعد إذا تم تغيير التاريخ أو الوقت
    if (updateData.appointmentDate || updateData.appointmentTime) {
      const appointmentDate = updateData.appointmentDate || appointment.appointmentDate;
      const appointmentTime = updateData.appointmentTime || appointment.appointmentTime;
      const duration = updateData.duration || appointment.duration;

      const appointmentDateTime = new Date(`${appointmentDate}T${appointmentTime}`);
      const endTime = new Date(appointmentDateTime.getTime() + (duration * 60000));

      const conflictingAppointment = await Appointment.findOne({
        where: {
          userId,
          id: { [Op.ne]: id },
          appointmentDate: {
            [Op.between]: [appointmentDateTime, endTime]
          },
          status: {
            [Op.in]: ['pending', 'confirmed']
          }
        }
      });

      if (conflictingAppointment) {
        return res.status(409).json({
          success: false,
          message: 'هذا الموعد متداخل مع موعد آخر موجود',
          conflictingAppointment: {
            id: conflictingAppointment.id,
            customerName: conflictingAppointment.customerName,
            appointmentDate: conflictingAppointment.appointmentDate,
            appointmentTime: conflictingAppointment.appointmentTime
          }
        });
      }
    }

    await appointment.update(updateData);

    res.json({
      success: true,
      message: 'تم تحديث الموعد بنجاح',
      appointment
    });

  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في تحديث الموعد',
      error: error.message
    });
  }
}

// حذف موعد
async function deleteAppointment(req, res) {
  try {
    const userId = req.userId;
    const { id } = req.params;

    const appointment = await Appointment.findOne({
      where: { id, userId }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    await appointment.destroy();

    res.json({
      success: true,
      message: 'تم حذف الموعد بنجاح'
    });

  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في حذف الموعد',
      error: error.message
    });
  }
}

// الحصول على إحصائيات المواعيد
async function getAppointmentStats(req, res) {
  try {
    const userId = req.userId;
    const { dateFrom, dateTo } = req.query;

    const whereClause = { userId };
    if (dateFrom || dateTo) {
      whereClause.appointmentDate = {};
      if (dateFrom) {
        whereClause.appointmentDate[Op.gte] = new Date(dateFrom);
      }
      if (dateTo) {
        whereClause.appointmentDate[Op.lte] = new Date(dateTo);
      }
    }

    const [
      totalAppointments,
      pendingAppointments,
      confirmedAppointments,
      completedAppointments,
      cancelledAppointments,
      todayAppointments,
      upcomingAppointments
    ] = await Promise.all([
      Appointment.count({ where: whereClause }),
      Appointment.count({ where: { ...whereClause, status: 'pending' } }),
      Appointment.count({ where: { ...whereClause, status: 'confirmed' } }),
      Appointment.count({ where: { ...whereClause, status: 'completed' } }),
      Appointment.count({ where: { ...whereClause, status: 'cancelled' } }),
      Appointment.count({
        where: {
          ...whereClause,
          appointmentDate: {
            [Op.between]: [
              new Date(new Date().setHours(0, 0, 0, 0)),
              new Date(new Date().setHours(23, 59, 59, 999))
            ]
          }
        }
      }),
      Appointment.count({
        where: {
          ...whereClause,
          appointmentDate: { [Op.gt]: new Date() },
          status: { [Op.in]: ['pending', 'confirmed'] }
        }
      })
    ]);

    // إحصائيات حسب نوع الخدمة
    const serviceStats = await Appointment.findAll({
      where: whereClause,
      attributes: [
        'serviceType',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['serviceType'],
      order: [[require('sequelize').fn('COUNT', require('sequelize').col('id')), 'DESC']]
    });

    // إحصائيات حسب الأولوية
    const priorityStats = await Appointment.findAll({
      where: whereClause,
      attributes: [
        'priority',
        [require('sequelize').fn('COUNT', require('sequelize').col('id')), 'count']
      ],
      group: ['priority'],
      order: [[require('sequelize').fn('COUNT', require('sequelize').col('id')), 'DESC']]
    });

    res.json({
      success: true,
      stats: {
        total: totalAppointments,
        pending: pendingAppointments,
        confirmed: confirmedAppointments,
        completed: completedAppointments,
        cancelled: cancelledAppointments,
        today: todayAppointments,
        upcoming: upcomingAppointments,
        serviceStats,
        priorityStats
      }
    });

  } catch (error) {
    console.error('Error fetching appointment stats:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب إحصائيات المواعيد',
      error: error.message
    });
  }
}

// تصدير المواعيد إلى Excel
async function exportAppointments(req, res) {
  try {
    const userId = req.userId;
    const { dateFrom, dateTo, status } = req.query;

    const whereClause = { userId };
    if (status) {
      whereClause.status = status;
    }
    if (dateFrom || dateTo) {
      whereClause.appointmentDate = {};
      if (dateFrom) {
        whereClause.appointmentDate[Op.gte] = new Date(dateFrom);
      }
      if (dateTo) {
        whereClause.appointmentDate[Op.lte] = new Date(dateTo);
      }
    }

    const appointments = await Appointment.findAll({
      where: whereClause,
      include: [
        {
          model: require('../models').User,
          as: 'assignedUser',
          attributes: ['name', 'email']
        }
      ],
      order: [['appointmentDate', 'ASC']]
    });

    if (appointments.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'لا توجد مواعيد للتصدير'
      });
    }

    // تحضير البيانات للتصدير
    const excelData = appointments.map((appointment, index) => ({
      'رقم الموعد': index + 1,
      'اسم العميل': appointment.customerName,
      'رقم الهاتف': appointment.customerPhone,
      'البريد الإلكتروني': appointment.customerEmail || '',
      'نوع الخدمة': appointment.serviceType,
      'وصف الخدمة': appointment.serviceDescription || '',
      'التاريخ': moment(appointment.appointmentDate).format('YYYY-MM-DD'),
      'الوقت': appointment.appointmentTime,
      'المدة (دقيقة)': appointment.duration,
      'الحالة': appointment.status,
      'الأولوية': appointment.priority,
      'المكان': appointment.location || '',
      'الملاحظات': appointment.notes || '',
      'المصدر': appointment.source,
      'المسؤول': appointment.assignedUser?.name || '',
      'السعر': appointment.price || '',
      'حالة الدفع': appointment.paymentStatus,
      'تاريخ المتابعة': appointment.followUpDate ? moment(appointment.followUpDate).format('YYYY-MM-DD') : '',
      'تاريخ الإنشاء': moment(appointment.createdAt).format('YYYY-MM-DD HH:mm'),
      'تاريخ التحديث': moment(appointment.updatedAt).format('YYYY-MM-DD HH:mm')
    }));

    // إنشاء ملف Excel
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // تحديد عرض الأعمدة
    const columnWidths = [
      { wch: 10 }, // رقم الموعد
      { wch: 20 }, // اسم العميل
      { wch: 15 }, // رقم الهاتف
      { wch: 25 }, // البريد الإلكتروني
      { wch: 20 }, // نوع الخدمة
      { wch: 30 }, // وصف الخدمة
      { wch: 12 }, // التاريخ
      { wch: 10 }, // الوقت
      { wch: 12 }, // المدة
      { wch: 12 }, // الحالة
      { wch: 12 }, // الأولوية
      { wch: 20 }, // المكان
      { wch: 30 }, // الملاحظات
      { wch: 12 }, // المصدر
      { wch: 20 }, // المسؤول
      { wch: 10 }, // السعر
      { wch: 12 }, // حالة الدفع
      { wch: 12 }, // تاريخ المتابعة
      { wch: 18 }, // تاريخ الإنشاء
      { wch: 18 }  // تاريخ التحديث
    ];
    worksheet['!cols'] = columnWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'المواعيد');

    // إرسال الملف
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `appointments_${moment().format('YYYY-MM-DD')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);

    res.send(buffer);

  } catch (error) {
    console.error('Error exporting appointments:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في تصدير المواعيد',
      error: error.message
    });
  }
}

// التحقق من توفر موعد
async function checkAvailability(req, res) {
  try {
    const userId = req.userId;
    const { date, time, duration = 60 } = req.query;

    if (!date || !time) {
      return res.status(400).json({
        success: false,
        message: 'التاريخ والوقت مطلوبان'
      });
    }

    const appointmentDateTime = new Date(`${date}T${time}`);
    const endTime = new Date(appointmentDateTime.getTime() + (duration * 60000));

    const conflictingAppointment = await Appointment.findOne({
      where: {
        userId,
        appointmentDate: {
          [Op.between]: [appointmentDateTime, endTime]
        },
        status: {
          [Op.in]: ['pending', 'confirmed']
        }
      }
    });

    res.json({
      success: true,
      available: !conflictingAppointment,
      conflictingAppointment: conflictingAppointment ? {
        id: conflictingAppointment.id,
        customerName: conflictingAppointment.customerName,
        appointmentDate: conflictingAppointment.appointmentDate,
        appointmentTime: conflictingAppointment.appointmentTime
      } : null
    });

  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في التحقق من توفر الموعد',
      error: error.message
    });
  }
}

// إرسال تذكير بالموعد
async function sendAppointmentReminder(req, res) {
  try {
    const userId = req.userId;
    const { appointmentId } = req.params;
    const { message } = req.body;

    const appointment = await Appointment.findOne({
      where: { id: appointmentId, userId }
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'الموعد غير موجود'
      });
    }

    const result = await notificationService.sendCustomReminder(appointmentId, message);

    res.json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Error sending appointment reminder:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في إرسال التذكير',
      error: error.message
    });
  }
}

// الحصول على إحصائيات التذكيرات
async function getReminderStats(req, res) {
  try {
    const userId = req.userId;
    const result = await notificationService.getReminderStats(userId);

    res.json(result);

  } catch (error) {
    console.error('Error getting reminder stats:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في جلب إحصائيات التذكيرات',
      error: error.message
    });
  }
}

// إرسال تذكيرات المواعيد القادمة
async function sendUpcomingReminders(req, res) {
  try {
    const result = await notificationService.sendUpcomingAppointmentsReminders();

    res.json(result);

  } catch (error) {
    console.error('Error sending upcoming reminders:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في إرسال تذكيرات المواعيد القادمة',
      error: error.message
    });
  }
}

// إرسال ملخص المواعيد اليومية
async function sendDailyReminders(req, res) {
  try {
    const result = await notificationService.sendDailyAppointmentsReminders();

    res.json(result);

  } catch (error) {
    console.error('Error sending daily reminders:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في إرسال ملخص المواعيد اليومية',
      error: error.message
    });
  }
}

module.exports = {
  createAppointment,
  getAppointments,
  getAppointment,
  updateAppointment,
  deleteAppointment,
  getAppointmentStats,
  exportAppointments,
  checkAvailability,
  sendAppointmentReminder,
  getReminderStats,
  sendUpcomingReminders,
  sendDailyReminders
};
