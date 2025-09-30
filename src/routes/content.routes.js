const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/content.controller');

const router = Router();

router.use(requireAuth);

// Categories
router.get('/categories', ctrl.listCategories);
router.post('/categories', ctrl.createCategory);
router.put('/categories/:id', ctrl.updateCategory);
router.delete('/categories/:id', ctrl.deleteCategory);

// Items within a category
router.get('/categories/:categoryId/items', ctrl.listItems);
router.post('/categories/:categoryId/items', ctrl.createItem);

// Single item
router.get('/items/:id', ctrl.getItem);
router.put('/items/:id', ctrl.updateItem);
router.delete('/items/:id', ctrl.deleteItem);

// Schedule an item using existing posts pipeline
router.post('/items/:id/schedule', ctrl.scheduleItem);

module.exports = router;


