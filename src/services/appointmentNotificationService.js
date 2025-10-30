const { Appointment } = require('../models');
const { Op } = require('sequelize');
const moment = require('moment-timezone');
const cron = require('node-cron');

// إرسال تذكير بالموعد
async function sendAppointmentReminder(appointment) {
  try {
    // هنا يمكنك إضافة منطق إرسال التذكير عبر الواتساب أو البريد الإلكتروني
    console.log(`إرسال تذكير بالموعد #${appointment.id} للعميل ${appointment.customerName}`);
    
    // تحديث حالة التذكير
    await appointment.update({
      reminderSent: true,
      reminderSentAt: new Date()
    });

    return { success: true, message: 'تم إرسال التذكير بنجاح' };
  } catch (error) {
    console.error('Error sending appointment reminder:', error);
    return { success: false, message: 'فشل في إرسال التذكير', error: error.message };
  }
}

// إرسال تذكير بالمواعيد القادمة
async function sendUpcomingAppointmentsReminders() {
  try {
    const now = moment();
    const reminderTime = now.clone().add(1, 'hour'); // تذكير قبل ساعة
    const reminderEndTime = now.clone().add(2, 'hours');

    const upcomingAppointments = await Appointment.findAll({
      where: {
        appointmentDate: {
          [Op.between]: [reminderTime.toDate(), reminderEndTime.toDate()]
        },
        status: {
          [Op.in]: ['pending', 'confirmed']
        },
        reminderSent: false
      },
      order: [['appointmentDate', 'ASC']]
    });

    console.log(`تم العثور على ${upcomingAppointments.length} موعد يحتاج تذكير`);

    for (const appointment of upcomingAppointments) {
      await sendAppointmentReminder(appointment);
    }

    return {
      success: true,
      message: `تم إرسال تذكيرات لـ ${upcomingAppointments.length} موعد`,
      appointmentsCount: upcomingAppointments.length
    };
  } catch (error) {
    console.error('Error sending upcoming appointments reminders:', error);
    return { success: false, message: 'فشل في إرسال تذكيرات المواعيد', error: error.message };
  }
}

// إرسال تذكير بالمواعيد اليومية
async function sendDailyAppointmentsReminders() {
  try {
    const today = moment().startOf('day');
    const tomorrow = moment().add(1, 'day').startOf('day');

    const todayAppointments = await Appointment.findAll({
      where: {
        appointmentDate: {
          [Op.between]: [today.toDate(), tomorrow.toDate()]
        },
        status: {
          [Op.in]: ['pending', 'confirmed']
        }
      },
      order: [['appointmentTime', 'ASC']]
    });

    console.log(`تم العثور على ${todayAppointments.length} موعد اليوم`);

    // إرسال ملخص المواعيد اليومية
    if (todayAppointments.length > 0) {
      const summary = `📅 ملخص مواعيد اليوم:\n\n`;
      const appointmentsList = todayAppointments.map((apt, index) => {
        const time = moment(apt.appointmentTime, 'HH:mm:ss').format('HH:mm');
        return `${index + 1}. ${apt.customerName} - ${apt.serviceType} - ${time}`;
      }).join('\n');

      console.log(summary + appointmentsList);
    }

    return {
      success: true,
      message: `تم إرسال ملخص ${todayAppointments.length} موعد اليوم`,
      appointmentsCount: todayAppointments.length
    };
  } catch (error) {
    console.error('Error sending daily appointments reminders:', error);
    return { success: false, message: 'فشل في إرسال ملخص المواعيد اليومية', error: error.message };
  }
}

// إرسال تذكير بالمواعيد المفقودة (لم يحضر)
async function sendMissedAppointmentsReminders() {
  try {
    const now = moment();
    const oneHourAgo = now.clone().subtract(1, 'hour');

    const missedAppointments = await Appointment.findAll({
      where: {
        appointmentDate: {
          [Op.lt]: oneHourAgo.toDate()
        },
        status: 'confirmed',
        reminderSent: true
      }
    });

    console.log(`تم العثور على ${missedAppointments.length} موعد مفقود`);

    for (const appointment of missedAppointments) {
      // تحديث حالة الموعد إلى "لم يحضر"
      await appointment.update({
        status: 'no_show'
      });

      console.log(`تم تحديث الموعد #${appointment.id} إلى "لم يحضر"`);
    }

    return {
      success: true,
      message: `تم تحديث ${missedAppointments.length} موعد مفقود`,
      appointmentsCount: missedAppointments.length
    };
  } catch (error) {
    console.error('Error handling missed appointments:', error);
    return { success: false, message: 'فشل في معالجة المواعيد المفقودة', error: error.message };
  }
}

// إرسال تذكير بالمواعيد الأسبوعية
async function sendWeeklyAppointmentsReminders() {
  try {
    const startOfWeek = moment().startOf('week');
    const endOfWeek = moment().endOf('week');

    const weeklyAppointments = await Appointment.findAll({
      where: {
        appointmentDate: {
          [Op.between]: [startOfWeek.toDate(), endOfWeek.toDate()]
        },
        status: {
          [Op.in]: ['pending', 'confirmed', 'completed']
        }
      },
      order: [['appointmentDate', 'ASC']]
    });

    // تجميع المواعيد حسب اليوم
    const appointmentsByDay = {};
    weeklyAppointments.forEach(appointment => {
      const day = moment(appointment.appointmentDate).format('dddd');
      if (!appointmentsByDay[day]) {
        appointmentsByDay[day] = [];
      }
      appointmentsByDay[day].push(appointment);
    });

    console.log(`ملخص المواعيد الأسبوعية:`, appointmentsByDay);

    return {
      success: true,
      message: `تم إرسال ملخص ${weeklyAppointments.length} موعد أسبوعي`,
      appointmentsCount: weeklyAppointments.length,
      appointmentsByDay
    };
  } catch (error) {
    console.error('Error sending weekly appointments reminders:', error);
    return { success: false, message: 'فشل في إرسال ملخص المواعيد الأسبوعية', error: error.message };
  }
}

// جدولة المهام التلقائية
function scheduleAppointmentReminders() {
  // تذكير كل ساعة بالمواعيد القادمة
  cron.schedule('0 * * * *', async () => {
    console.log('تشغيل تذكيرات المواعيد القادمة...');
    await sendUpcomingAppointmentsReminders();
  });

  // تذكير يومي في الصباح
  cron.schedule('0 8 * * *', async () => {
    console.log('تشغيل تذكيرات المواعيد اليومية...');
    await sendDailyAppointmentsReminders();
  });

  // معالجة المواعيد المفقودة كل ساعة
  cron.schedule('0 * * * *', async () => {
    console.log('معالجة المواعيد المفقودة...');
    await sendMissedAppointmentsReminders();
  });

  // ملخص أسبوعي كل يوم أحد
  cron.schedule('0 9 * * 0', async () => {
    console.log('تشغيل ملخص المواعيد الأسبوعية...');
    await sendWeeklyAppointmentsReminders();
  });

  console.log('تم جدولة تذكيرات المواعيد التلقائية');
}

// إرسال تذكير مخصص
async function sendCustomReminder(appointmentId, message) {
  try {
    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) {
      return { success: false, message: 'الموعد غير موجود' };
    }

    // إرسال التذكير المخصص
    console.log(`إرسال تذكير مخصص للموعد #${appointmentId}: ${message}`);

    return { success: true, message: 'تم إرسال التذكير المخصص بنجاح' };
  } catch (error) {
    console.error('Error sending custom reminder:', error);
    return { success: false, message: 'فشل في إرسال التذكير المخصص', error: error.message };
  }
}

// الحصول على إحصائيات التذكيرات
async function getReminderStats(userId) {
  try {
    const now = moment();
    const today = now.startOf('day').toDate();
    const tomorrow = now.clone().add(1, 'day').startOf('day').toDate();

    const [
      totalAppointments,
      sentReminders,
      pendingReminders,
      todayAppointments,
      upcomingAppointments
    ] = await Promise.all([
      Appointment.count({ where: { userId } }),
      Appointment.count({ 
        where: { 
          userId, 
          reminderSent: true 
        } 
      }),
      Appointment.count({ 
        where: { 
          userId, 
          reminderSent: false,
          appointmentDate: { [Op.gte]: new Date() }
        } 
      }),
      Appointment.count({ 
        where: { 
          userId, 
          appointmentDate: { 
            [Op.between]: [today, tomorrow] 
          } 
        } 
      }),
      Appointment.count({ 
        where: { 
          userId, 
          appointmentDate: { [Op.gte]: new Date() },
          status: { [Op.in]: ['pending', 'confirmed'] }
        } 
      })
    ]);

    return {
      success: true,
      stats: {
        totalAppointments,
        sentReminders,
        pendingReminders,
        todayAppointments,
        upcomingAppointments,
        reminderRate: totalAppointments > 0 ? (sentReminders / totalAppointments * 100).toFixed(2) : 0
      }
    };
  } catch (error) {
    console.error('Error getting reminder stats:', error);
    return { success: false, message: 'فشل في جلب إحصائيات التذكيرات', error: error.message };
  }
}

module.exports = {
  sendAppointmentReminder,
  sendUpcomingAppointmentsReminders,
  sendDailyAppointmentsReminders,
  sendMissedAppointmentsReminders,
  sendWeeklyAppointmentsReminders,
  scheduleAppointmentReminders,
  sendCustomReminder,
  getReminderStats
};



