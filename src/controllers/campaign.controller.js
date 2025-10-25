const { ContactTag } = require('../models/tag');
const whatsappService = require('../services/whatsappService');

exports.sendToTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { tagId, messageTemplate, throttleMs } = req.body;
    if (!tagId) return res.status(400).json({ success: false, message: 'tagId required' });
    
    // التحقق من القيود
    const throttleMinutes = parseInt(throttleMs) / (1000 * 60); // تحويل من milliseconds إلى دقائق
    if (throttleMinutes < 5) {
      return res.status(400).json({ 
        success: false, 
        message: 'الحد الأدنى للدقائق بين الرسائل هو 5 دقائق' 
      });
    }
    
    const items = await ContactTag.findAll({ where: { userId, tagId } });
    if (items.length === 0) return res.json({ success: true, summary: { sent: 0, failed: 0, total: 0 } });

    // التحقق من عدد الأرقام
    if (items.length > 500) {
      return res.status(400).json({ 
        success: false, 
        message: 'الحد الأقصى للأرقام في الحملة هو 500 رقم' 
      });
    }

    let sent = 0, failed = 0;
    for (const it of items) {
      const ok = await whatsappService.sendMessage(userId, it.contactNumber, String(messageTemplate || ''));
      if (ok) sent++; else failed++;
      await new Promise(r => setTimeout(r, Number(throttleMs || 2500)));
    }
    return res.json({ success: true, summary: { sent, failed, total: items.length } });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};







