const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
  createTag,
  getTags,
  updateTag,
  deleteTag,
  addContactToTag,
  removeContactFromTag,
  listContactsByTag,
  getAllContacts
} = require('../controllers/tag.controller');

router.post('/tags', requireAuth, createTag);
router.get('/tags', requireAuth, getTags);
router.put('/tags/:id', requireAuth, updateTag);
router.delete('/tags/:id', requireAuth, deleteTag);

router.post('/tags/:id/contacts', requireAuth, addContactToTag);
router.delete('/tags/:id/contacts', requireAuth, removeContactFromTag);
router.get('/tags/:id/contacts', requireAuth, listContactsByTag);
router.get('/contacts', requireAuth, getAllContacts);

module.exports = router;



