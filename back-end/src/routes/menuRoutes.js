const express = require('express');
const authenticate = require('../middlewares/authenticate');
const { requireRole } = require('../middlewares/verify_role');
const categoryController = require('../controllers/categoryController');
const productController = require('../controllers/productController');
const { createImageUpload } = require('../middlewares/uploadImage');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();
const uploadImage = createImageUpload('image');

router.get('/categories', categoryController.getAllCategories);
router.get('/categories/:id', categoryController.getCategoryById);
router.get('/products', productController.getAllProducts);
router.get('/products/:id', productController.getProductById);

router.use(authenticate);
router.use(requirePermission('menu:read'));

router.post('/categories', requirePermission('categories:write'), uploadImage, categoryController.createCategory);
router.put('/categories/:id', requirePermission('categories:write'), uploadImage, categoryController.updateCategory);
router.delete('/categories/:id', requirePermission('categories:write'), categoryController.deleteCategory);

router.post('/products', requirePermission('menu:write'), uploadImage, productController.createProduct);
router.put('/products/:id', requirePermission('menu:write'), uploadImage, productController.updateProduct);
router.delete('/products/:id', requirePermission('menu:write'), productController.deleteProduct);
router.patch('/products/:id/toggle-availability', requirePermission('menu:write'), productController.toggleAvailability);

router.post('/images/:type/:id', requirePermission('menu:write'), uploadImage, productController.uploadImage);
router.delete('/images/:type/:id', requirePermission('menu:write'), productController.removeImage);

module.exports = router;
