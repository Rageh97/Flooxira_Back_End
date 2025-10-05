const express = require('express');
const router = express.Router();
const {
  createTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  deleteTemplate,
  createButton,
  updateButton,
  deleteButton,
  getActiveTemplates
} = require('../controllers/whatsappTemplate.controller');
const { requireAuth } = require('../middleware/auth');

// Template routes
router.post('/templates', requireAuth, createTemplate);
router.get('/templates', requireAuth, getTemplates);
router.get('/templates/active', requireAuth, getActiveTemplates);
router.get('/templates/:id', requireAuth, getTemplate);
router.put('/templates/:id', requireAuth, updateTemplate);
router.delete('/templates/:id', requireAuth, deleteTemplate);

// Button routes
router.post('/buttons', requireAuth, createButton);
router.put('/buttons/:id', requireAuth, updateButton);
router.delete('/buttons/:id', requireAuth, deleteButton);

module.exports = router;