const express = require('express');
const router = express.Router();
const { createReminder, getUserReminders, deleteReminder } = require('../controllers/reminder.controller');
const { requireAuth } = require('../middleware/auth');

// All routes require authentication
router.use(requireAuth);

// Create reminder
router.post('/reminder', createReminder);

// Get user reminders
router.get('/reminder', getUserReminders);

// Delete reminder
router.delete('/:reminderId', deleteReminder);

module.exports = router;
