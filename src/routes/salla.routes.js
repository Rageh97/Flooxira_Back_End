const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
  exchangeCode, 
  getSallaAccount, 
  disconnectSalla, 
  testSallaConnection, 
  testNetworkConnectivity,
  getSallaStore,
  listSallaProducts,
  createSallaProduct,
  updateSallaProduct,
  listSallaOrders,
  updateSallaOrder,
  listSallaCustomers,
  updateSallaCustomer,
  listSallaCategories,
  createSallaCategory,
  updateSallaCategory,
  deleteSallaCategory,
  listSallaBrands,
  createSallaBrand,
  updateSallaBrand,
  deleteSallaBrand,
  listSallaBranches,
  createSallaBranch,
  updateSallaBranch,
  deleteSallaBranch,
  listSallaPayments,
  updateSallaPayment,
  getSallaSettings,
  updateSallaSettings,
  getSallaSettingsField,
  updateSallaSettingsField,
  listSallaReviews,
  updateSallaReview,
  listSallaQuestions,
  updateSallaQuestion
} = require('../controllers/salla.controller');

router.use(auth.requireAuth);

router.post('/exchange', exchangeCode);
router.get('/account', getSallaAccount);
router.get('/test', testSallaConnection);
router.get('/test-network', testNetworkConnectivity);
router.post('/disconnect', disconnectSalla);
router.get('/store', getSallaStore);
router.get('/products', listSallaProducts);
router.post('/products', createSallaProduct);
router.put('/products/:id', updateSallaProduct);
router.get('/orders', listSallaOrders);
router.put('/orders/:id', updateSallaOrder);
router.get('/customers', listSallaCustomers);
router.put('/customers/:id', updateSallaCustomer);

// Categories routes
router.get('/categories', listSallaCategories);
router.post('/categories', createSallaCategory);
router.put('/categories/:id', updateSallaCategory);
router.delete('/categories/:id', deleteSallaCategory);

// Brands routes
router.get('/brands', listSallaBrands);
router.post('/brands', createSallaBrand);
router.put('/brands/:id', updateSallaBrand);
router.delete('/brands/:id', deleteSallaBrand);

// Branches routes
router.get('/branches', listSallaBranches);
router.post('/branches', createSallaBranch);
router.put('/branches/:id', updateSallaBranch);
router.delete('/branches/:id', deleteSallaBranch);

// Payments routes
router.get('/payments', listSallaPayments);
router.put('/payments/:id', updateSallaPayment);

// Settings routes
router.get('/settings', getSallaSettings);
router.put('/settings', updateSallaSettings);
router.get('/settings/fields/:slug', getSallaSettingsField);
router.put('/settings/fields/:slug', updateSallaSettingsField);

// Reviews routes
router.get('/reviews', listSallaReviews);
router.put('/reviews/:id', updateSallaReview);

// Questions routes
router.get('/questions', listSallaQuestions);
router.put('/questions/:id', updateSallaQuestion);

module.exports = router;




