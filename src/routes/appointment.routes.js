const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const appointmentController = require('../controllers/appointment.controller');

const router = Router();

// تطبيق middleware المصادقة على جميع المسارات
router.use(requireAuth);

// مسارات المواعيد
router.post('/', appointmentController.createAppointment);
router.get('/', appointmentController.getAppointments);
router.get('/stats', appointmentController.getAppointmentStats);
router.get('/export', appointmentController.exportAppointments);
router.get('/check-availability', appointmentController.checkAvailability);
router.get('/reminder-stats', appointmentController.getReminderStats);
router.post('/send-upcoming-reminders', appointmentController.sendUpcomingReminders);
router.post('/send-daily-reminders', appointmentController.sendDailyReminders);
router.post('/:id/send-reminder', appointmentController.sendAppointmentReminder);
router.get('/:id', appointmentController.getAppointment);
router.put('/:id', appointmentController.updateAppointment);
router.delete('/:id', appointmentController.deleteAppointment);

module.exports = router;
