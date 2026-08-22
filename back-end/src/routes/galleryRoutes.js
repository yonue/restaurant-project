const express = require('express');
const authenticate = require('../middlewares/authenticate');
const { requireRole } = require('../middlewares/verify_role');
const { requireAdmin } = require('../middlewares/permissions');
const controller = require('../controllers/galleryController');

const router = express.Router();
let multer;
try { multer = require('multer'); } catch (_) { multer = null; }
const one = multer ? multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.MAX_GALLERY_FILE_SIZE_BYTES || 50 * 1024 * 1024) } }).single('file') : (req, res, next) => next();
const many = multer ? multer({ storage: multer.memoryStorage(), limits: { files: 50, fileSize: Number(process.env.MAX_GALLERY_FILE_SIZE_BYTES || 50 * 1024 * 1024) } }).array('files', 50) : (req, res, next) => next();

router.get('/categories', controller.listCategories);
router.get('/media', controller.listMedia);
router.get('/media/:id', controller.getMedia);
router.use(authenticate, requireAdmin);
router.post('/categories', controller.createCategory);
router.put('/categories/:id', controller.updateCategory);
router.delete('/categories/:id', controller.deleteCategory);
router.post('/media', one, controller.createMedia);
router.post('/media/bulk', many, controller.bulkUpload);
router.put('/media/:id', one, controller.updateMedia);
router.delete('/media/:id', controller.deleteMedia);
router.patch('/media/reorder', controller.reorderMedia);
router.patch('/media/bulk-action', controller.bulkAction);
module.exports = router;
