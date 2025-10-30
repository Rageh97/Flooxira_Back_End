const { ContentItem } = require('../models');
const { Reminder } = require('../models/reminder');
const whatsappService = require('../services/whatsappService');

// Create reminder
const createReminder = async (req, res) => {
  try {
    const { itemId, whatsappNumber, message, scheduledAt, timezoneOffset } = req.body;
    const userId = req.user.id;
    
    console.log(`[Reminder] Creating reminder with timezone offset: ${timezoneOffset}`);

    // Verify the content item belongs to the user
    const contentItem = await ContentItem.findOne({
      where: { id: itemId, userId }
    });

    if (!contentItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'العنصر غير موجود أو لا ينتمي لك' 
      });
    }

    if (!contentItem.scheduledAt) {
      return res.status(400).json({ 
        success: false, 
        message: 'هذا العنصر غير مجدول' 
      });
    }

    // Check if user has WhatsApp session connected (warning only, not blocking)
    const hasWhatsAppSession = whatsappService.userClients.has(userId);
    console.log(`[Reminder] User ${userId} WhatsApp session check:`, hasWhatsAppSession);
    console.log(`[Reminder] Available sessions:`, Array.from(whatsappService.userClients.keys()));
    
    if (!hasWhatsAppSession) {
      console.warn(`[Reminder] Warning: User ${userId} does not have active WhatsApp session. Reminder will be created but may not send.`);
      // Don't block - reminder will be created and scheduler will try to send when session is available
    }

    // scheduledAt is an ISO string from DB (stored in UTC format)
    // When we parse it, we get the correct UTC time
    const scheduledTime = new Date(scheduledAt);
    const now = new Date();
    
    console.log(`[Reminder] Creating reminder for scheduledAt: ${scheduledAt}`);
    console.log(`[Reminder] Parsed as Date object (UTC): ${scheduledTime.toISOString()}`);
    console.log(`[Reminder] Will publish at (Arabia time): ${scheduledTime.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', hour12: true, hour: '2-digit', minute: '2-digit' })}`);

    if (scheduledTime <= now) {
      return res.status(400).json({ 
        success: false, 
        message: 'لا يمكن إعداد تذكير لعنصر مجدول في الماضي' 
      });
    }

    // Calculate reminder times - subtract 2 hours and 1 hour from scheduled time
    const twoHoursBefore = new Date(scheduledTime.getTime() - (2 * 60 * 60 * 1000));
    const oneHourBefore = new Date(scheduledTime.getTime() - (1 * 60 * 60 * 1000));
    
    console.log(`[Reminder] Reminder times calculated:`);
    console.log(`  - First reminder (2 hours before):  ${twoHoursBefore.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })} (Arabia time)`);
    console.log(`  - Second reminder (1 hour before): ${oneHourBefore.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })} (Arabia time)`);

    // Only set reminders if they're in the future
    const remindersToSet = [];
    
    if (twoHoursBefore > now) {
      remindersToSet.push({
        time: twoHoursBefore,
        message: `⏰ تذكير قبل ساعتين:\n${message}`,
        whatsappNumber,
        itemId,
        userId
      });
    }

    if (oneHourBefore > now) {
      remindersToSet.push({
        time: oneHourBefore,
        message: `⏰ تذكير قبل ساعة:\n${message}`,
        whatsappNumber,
        itemId,
        userId
      });
    }

    if (remindersToSet.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'موعد النشر قريب جداً، لا يمكن إعداد تذكير' 
      });
    }

    // Save reminder to database
    const reminder = await Reminder.create({
      userId,
      contentItemId: itemId,
      whatsappNumber,
      message,
      scheduledAt: scheduledTime,
      reminderTime1: twoHoursBefore,
      reminderTime2: oneHourBefore,
      status: 'active'
    });

    console.log(`[Reminder] Created reminder ${reminder.id} for item ${itemId}`);
    console.log(`[Reminder] Will send at: ${twoHoursBefore.toISOString()} and ${oneHourBefore.toISOString()}`);

    // Format times for display in Arabia timezone
    const scheduledAtDisplay = scheduledTime.toLocaleString('ar-SA', { 
      timeZone: 'Asia/Riyadh', 
      hour12: true,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const reminder1Display = twoHoursBefore.toLocaleString('ar-SA', { 
      timeZone: 'Asia/Riyadh', 
      hour12: true,
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const reminder2Display = oneHourBefore.toLocaleString('ar-SA', { 
      timeZone: 'Asia/Riyadh', 
      hour12: true,
      hour: '2-digit',
      minute: '2-digit'
    });

    console.log(`[Reminder] ✅ Reminder created successfully!`);
    console.log(`[Reminder] Display times for user:`);
    console.log(`  - موعد النشر: ${scheduledAtDisplay}`);
    console.log(`  - التذكير الأول: ${reminder1Display}`);
    console.log(`  - التذكير الثاني: ${reminder2Display}`);

    res.json({
      success: true,
      message: `✅ تم إعداد التذكير بنجاح!\n📅 موعد النشر: ${scheduledAtDisplay}\n⏰ سيتم التذكير في: ${reminder1Display} و ${reminder2Display}`,
      reminderId: reminder.id,
      reminder: {
        id: reminder.id,
        scheduledAt: scheduledTime.toISOString(),
        scheduledAtDisplay,
        reminderTime1: twoHoursBefore.toISOString(),
        reminderTime1Display: reminder1Display,
        reminderTime2: oneHourBefore.toISOString(),
        reminderTime2Display: reminder2Display,
        whatsappNumber,
        message
      }
    });

  } catch (error) {
    console.error('Error creating reminder:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ في إعداد التذكير' 
    });
  }
};

// Send WhatsApp message (placeholder - integrate with your WhatsApp service)
const sendWhatsAppMessage = async (number, message) => {
  // This is a placeholder function
  // In production, integrate with your WhatsApp API service
  console.log(`Sending WhatsApp message to ${number}: ${message}`);
  
  // Example integration with WhatsApp Business API:
  /*
  const response = await fetch('https://graph.facebook.com/v17.0/YOUR_PHONE_NUMBER_ID/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: number,
      type: 'text',
      text: { body: message }
    })
  });
  */
};

// Get user reminders
const getUserReminders = async (req, res) => {
  try {
    const userId = req.user.id;
    const userReminders = await Reminder.findAll({
      where: { userId, status: 'active' },
      include: [
        {
          model: ContentItem,
          as: 'contentItem',
          attributes: ['id', 'title', 'scheduledAt']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      reminders: userReminders.map(reminder => ({
        id: reminder.id,
        contentItemId: reminder.contentItemId,
        whatsappNumber: reminder.whatsappNumber,
        message: reminder.message,
        scheduledAt: reminder.scheduledAt,
        reminderTime1: reminder.reminderTime1,
        reminderTime2: reminder.reminderTime2,
        status: reminder.status,
        createdAt: reminder.createdAt,
        contentItem: reminder.contentItem
      }))
    });

  } catch (error) {
    console.error('Error getting reminders:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ في جلب التذكيرات' 
    });
  }
};

// Delete reminder
const deleteReminder = async (req, res) => {
  try {
    const { reminderId } = req.params;
    const userId = req.user.id;

    const reminder = reminders.get(reminderId);
    if (!reminder || reminder.userId !== userId) {
      return res.status(404).json({ 
        success: false, 
        message: 'التذكير غير موجود' 
      });
    }

    // Remove from memory
    reminders.delete(reminderId);

    res.json({
      success: true,
      message: 'تم حذف التذكير بنجاح'
    });

  } catch (error) {
    console.error('Error deleting reminder:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ في حذف التذكير' 
    });
  }
};

module.exports = {
  createReminder,
  getUserReminders,
  deleteReminder
};
