const { Appointment } = require('../models');
const { Op } = require('sequelize');
const moment = require('moment-timezone');

// أنماط الكلمات المفتاحية لفهم طلبات المواعيد
const APPOINTMENT_PATTERNS = {
  // كلمات طلب الموعد
  booking: [
    'حجز موعد', 'حجز طلب', 'موعد', 'حجز', 'حجز خدمة', 'حجز استشارة',
    'أريد موعد', 'بدي موعد', 'أحتاج موعد', 'أرغب في موعد',
    'book appointment', 'schedule', 'appointment', 'booking'
  ],
  
  // كلمات الخدمات
  services: [
    'استشارة', 'جلسة', 'علاج', 'فحص', 'كشف', 'متابعة', 'تطوير',
    'تصميم', 'برمجة', 'تسويق', 'إدارة', 'تدريب', 'تعليم',
    'consultation', 'session', 'treatment', 'examination', 'follow-up',
    'development', 'design', 'programming', 'marketing', 'management', 'training'
  ],
  
  // كلمات الوقت والتاريخ
  time: [
    'اليوم', 'غداً', 'بعد غد', 'هذا الأسبوع', 'الأسبوع القادم',
    'الصباح', 'المساء', 'الليل', 'الظهيرة', 'العصر',
    'صباحاً', 'مساءً', 'ليلاً', 'ظهراً', 'عصراً',
    'today', 'tomorrow', 'morning', 'evening', 'night', 'afternoon'
  ],
  
  // كلمات الأولوية
  priority: [
    'عاجل', 'مستعجل', 'سريع', 'فوري', 'أولوية', 'مهم',
    'urgent', 'asap', 'priority', 'important', 'quick'
  ],
  
  // كلمات الحالة
  status: [
    'تأكيد', 'إلغاء', 'تأجيل', 'تغيير', 'تعديل',
    'confirm', 'cancel', 'postpone', 'change', 'modify'
  ]
};

// أنماط التاريخ والوقت
const DATE_TIME_PATTERNS = {
  // التواريخ النسبية
  relative: {
    'اليوم': 0,
    'غداً': 1,
    'بعد غد': 2,
    'هذا الأسبوع': 0,
    'الأسبوع القادم': 7
  },
  
  // أوقات اليوم
  timeOfDay: {
    'الصباح': '08:00',
    'صباحاً': '08:00',
    'الظهيرة': '12:00',
    'ظهراً': '12:00',
    'العصر': '15:00',
    'عصراً': '15:00',
    'المساء': '18:00',
    'مساءً': '18:00',
    'الليل': '20:00',
    'ليلاً': '20:00'
  }
};

// استخراج المعلومات من النص
function extractAppointmentInfo(text) {
  const normalizedText = text.toLowerCase().trim();
  const info = {
    isAppointmentRequest: false,
    serviceType: null,
    preferredDate: null,
    preferredTime: null,
    priority: 'medium',
    customerName: null,
    customerPhone: null,
    notes: []
  };

  // التحقق من وجود طلب موعد
  const hasBookingKeywords = APPOINTMENT_PATTERNS.booking.some(keyword => 
    normalizedText.includes(keyword.toLowerCase())
  );

  if (!hasBookingKeywords) {
    return info;
  }

  info.isAppointmentRequest = true;

  // استخراج نوع الخدمة
  for (const service of APPOINTMENT_PATTERNS.services) {
    if (normalizedText.includes(service.toLowerCase())) {
      info.serviceType = service;
      break;
    }
  }

  // استخراج التاريخ المفضل
  const today = moment();
  for (const [keyword, days] of Object.entries(DATE_TIME_PATTERNS.relative)) {
    if (normalizedText.includes(keyword)) {
      info.preferredDate = today.add(days, 'days').format('YYYY-MM-DD');
      break;
    }
  }

  // استخراج الوقت المفضل
  for (const [keyword, time] of Object.entries(DATE_TIME_PATTERNS.timeOfDay)) {
    if (normalizedText.includes(keyword)) {
      info.preferredTime = time;
      break;
    }
  }

  // استخراج الأولوية
  for (const priority of APPOINTMENT_PATTERNS.priority) {
    if (normalizedText.includes(priority.toLowerCase())) {
      info.priority = 'high';
      break;
    }
  }

  // استخراج اسم العميل (نمط بسيط)
  const nameMatch = normalizedText.match(/(?:اسمي|أنا|أنا اسمي)\s+([أ-ي\s]+)/i);
  if (nameMatch) {
    info.customerName = nameMatch[1].trim();
  }

  // استخراج رقم الهاتف
  const phoneMatch = normalizedText.match(/(?:رقمي|هاتفي|رقم هاتفي)\s*:?\s*(\d{10,15})/i);
  if (phoneMatch) {
    info.customerPhone = phoneMatch[1];
  }

  // استخراج ملاحظات إضافية
  const notesKeywords = ['ملاحظة', 'تفاصيل', 'معلومات', 'note', 'details'];
  for (const keyword of notesKeywords) {
    if (normalizedText.includes(keyword)) {
      const noteMatch = normalizedText.match(new RegExp(`${keyword}\\s*:?\\s*([^\\n]+)`, 'i'));
      if (noteMatch) {
        info.notes.push(noteMatch[1].trim());
      }
    }
  }

  return info;
}

// التحقق من توفر الموعد
async function checkAppointmentAvailability(userId, appointmentDate, appointmentTime, duration = 60) {
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

  return {
    available: !conflictingAppointment,
    conflictingAppointment: conflictingAppointment ? {
      id: conflictingAppointment.id,
      customerName: conflictingAppointment.customerName,
      appointmentDate: conflictingAppointment.appointmentDate,
      appointmentTime: conflictingAppointment.appointmentTime
    } : null
  };
}

// اقتراح أوقات بديلة
async function suggestAlternativeTimes(userId, preferredDate, preferredTime, duration = 60) {
  const suggestions = [];
  const baseTime = moment(`${preferredDate} ${preferredTime}`);
  
  // اقتراح أوقات في نفس اليوم
  const timeSlots = [
    baseTime.clone().subtract(1, 'hour'),
    baseTime.clone().add(1, 'hour'),
    baseTime.clone().add(2, 'hours'),
    baseTime.clone().add(3, 'hours')
  ];

  for (const timeSlot of timeSlots) {
    const availability = await checkAppointmentAvailability(
      userId,
      timeSlot.format('YYYY-MM-DD'),
      timeSlot.format('HH:mm'),
      duration
    );

    if (availability.available) {
      suggestions.push({
        date: timeSlot.format('YYYY-MM-DD'),
        time: timeSlot.format('HH:mm'),
        displayTime: timeSlot.format('YYYY-MM-DD HH:mm')
      });
    }
  }

  // اقتراح أوقات في الأيام التالية
  for (let i = 1; i <= 7; i++) {
    const nextDay = baseTime.clone().add(i, 'days');
    const availability = await checkAppointmentAvailability(
      userId,
      nextDay.format('YYYY-MM-DD'),
      preferredTime,
      duration
    );

    if (availability.available) {
      suggestions.push({
        date: nextDay.format('YYYY-MM-DD'),
        time: preferredTime,
        displayTime: nextDay.format('YYYY-MM-DD') + ' ' + preferredTime
      });
    }
  }

  return suggestions.slice(0, 5); // إرجاع 5 اقتراحات فقط
}

// إنشاء رد ذكي لطلب الموعد
async function generateAppointmentResponse(userId, customerMessage, contactNumber) {
  const appointmentInfo = extractAppointmentInfo(customerMessage);
  
  if (!appointmentInfo.isAppointmentRequest) {
    return {
      isAppointmentRequest: false,
      response: null
    };
  }

  let response = '';
  let appointmentData = null;

  // التحقق من البيانات المطلوبة
  if (!appointmentInfo.serviceType) {
    response = 'أهلاً! أود مساعدتك في حجز موعد. من فضلك أخبرني:\n';
    response += '• نوع الخدمة المطلوبة\n';
    response += '• التاريخ والوقت المناسب لك\n';
    response += '• اسمك ورقم هاتفك\n\n';
    response += 'مثال: "أريد حجز موعد استشارة غداً في الصباح، اسمي أحمد ورقمي 0501234567"';
    
    return {
      isAppointmentRequest: true,
      response,
      needsMoreInfo: true,
      appointmentData: null
    };
  }

  // التحقق من توفر الموعد إذا تم تحديد التاريخ والوقت
  if (appointmentInfo.preferredDate && appointmentInfo.preferredTime) {
    const availability = await checkAppointmentAvailability(
      userId,
      appointmentInfo.preferredDate,
      appointmentInfo.preferredTime
    );

    if (availability.available) {
      // الموعد متاح - إنشاء الموعد
      try {
        const appointment = await Appointment.create({
          userId,
          customerName: appointmentInfo.customerName || 'عميل',
          customerPhone: appointmentInfo.customerPhone || contactNumber || 'غير محدد',
          serviceType: appointmentInfo.serviceType,
          serviceDescription: appointmentInfo.notes.join(' '),
          appointmentDate: new Date(`${appointmentInfo.preferredDate}T${appointmentInfo.preferredTime}`),
          appointmentTime: appointmentInfo.preferredTime,
          priority: appointmentInfo.priority,
          source: 'whatsapp',
          notes: appointmentInfo.notes.join(' ')
        });

        response = `✅ تم حجز الموعد بنجاح!\n\n`;
        response += `📅 التاريخ: ${appointmentInfo.preferredDate}\n`;
        response += `🕐 الوقت: ${appointmentInfo.preferredTime}\n`;
        response += `🔧 الخدمة: ${appointmentInfo.serviceType}\n`;
        response += `📞 رقم الموعد: #${appointment.id}\n\n`;
        response += `سيتم التواصل معك قريباً لتأكيد التفاصيل. شكراً لاختيارك خدماتنا!`;

        appointmentData = appointment;
      } catch (error) {
        response = 'عذراً، حدث خطأ في حجز الموعد. يرجى المحاولة مرة أخرى أو التواصل معنا مباشرة.';
      }
    } else {
      // الموعد غير متاح - اقتراح أوقات بديلة
      const suggestions = await suggestAlternativeTimes(
        userId,
        appointmentInfo.preferredDate,
        appointmentInfo.preferredTime
      );

      response = `❌ عذراً، الموعد المطلوب غير متاح في ${appointmentInfo.preferredDate} الساعة ${appointmentInfo.preferredTime}\n\n`;
      
      if (suggestions.length > 0) {
        response += `🕐 أوقات بديلة متاحة:\n`;
        suggestions.forEach((suggestion, index) => {
          response += `${index + 1}. ${suggestion.displayTime}\n`;
        });
        response += `\nيرجى اختيار وقت مناسب أو اقتراح وقت آخر.`;
      } else {
        response += `لا توجد أوقات متاحة في الأيام القادمة. يرجى التواصل معنا مباشرة لترتيب موعد مناسب.`;
      }
    }
  } else {
    // طلب معلومات إضافية
    response = `أهلاً! أود مساعدتك في حجز موعد ${appointmentInfo.serviceType}.\n\n`;
    
    if (!appointmentInfo.preferredDate) {
      response += `📅 متى تفضل الموعد؟ (مثال: غداً، بعد غد، هذا الأسبوع)\n`;
    }
    
    if (!appointmentInfo.preferredTime) {
      response += `🕐 في أي وقت؟ (مثال: الصباح، المساء، الساعة 2:00)\n`;
    }
    
    if (!appointmentInfo.customerName) {
      response += `👤 ما اسمك؟\n`;
    }
    
    if (!appointmentInfo.customerPhone) {
      response += `📞 رقم هاتفك للتواصل؟\n`;
    }
  }

  return {
    isAppointmentRequest: true,
    response,
    needsMoreInfo: !appointmentData,
    appointmentData
  };
}

// تحديث حالة الموعد
async function updateAppointmentStatus(appointmentId, status, notes = '') {
  try {
    const appointment = await Appointment.findByPk(appointmentId);
    if (!appointment) {
      return { success: false, message: 'الموعد غير موجود' };
    }

    await appointment.update({
      status,
      notes: appointment.notes ? `${appointment.notes}\n${notes}` : notes
    });

    return { success: true, message: 'تم تحديث حالة الموعد بنجاح', appointment };
  } catch (error) {
    return { success: false, message: 'حدث خطأ في تحديث الموعد', error: error.message };
  }
}

// الحصول على المواعيد القادمة
async function getUpcomingAppointments(userId, limit = 5) {
  try {
    const appointments = await Appointment.findAll({
      where: {
        userId,
        appointmentDate: { [Op.gte]: new Date() },
        status: { [Op.in]: ['pending', 'confirmed'] }
      },
      order: [['appointmentDate', 'ASC']],
      limit
    });

    return { success: true, appointments };
  } catch (error) {
    return { success: false, message: 'حدث خطأ في جلب المواعيد', error: error.message };
  }
}

module.exports = {
  extractAppointmentInfo,
  checkAppointmentAvailability,
  suggestAlternativeTimes,
  generateAppointmentResponse,
  updateAppointmentStatus,
  getUpcomingAppointments
};



