const express = require('express');
const authenticate = require('../middlewares/authenticate');
const { requireRole } = require('../middlewares/verify_role');
const controller = require('../controllers/siteMediaController');
const { requireAdmin } = require('../middlewares/permissions');
let multer;
try { multer = require('multer'); } catch (_) { multer = null; }
const upload = multer ? multer({ storage: multer.memoryStorage(), limits: { fileSize: Number(process.env.MAX_SITE_MEDIA_FILE_SIZE_BYTES || 50 * 1024 * 1024), files: 1 } }).single('file') : (req, res, next) => next();
const router = express.Router();
router.get('/', controller.list);
router.get('/:id', controller.get);
router.use(authenticate, requireAdmin);
router.post('/', upload, controller.create);
router.put('/:id', upload, controller.update);
router.delete('/:id', controller.remove);
router.patch('/reorder', controller.reorder);
module.exports = router;
