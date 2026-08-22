const express = require('express');
const authenticate = require('../middlewares/authenticate');
const { requirePermission } = require('../middlewares/permissions');
const controller = require('../controllers/zoneController');
const { createImageUpload } = require('../middlewares/uploadImage');

const router = express.Router();
router.get('/public', controller.publicList);
router.use(authenticate, requirePermission('zones:read'));
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', requirePermission('zones:write'), createImageUpload('image'), controller.create);
router.put('/:id', requirePermission('zones:write'), createImageUpload('image'), controller.update);
router.delete('/:id', requirePermission('zones:write'), controller.remove);
router.patch('/reorder', requirePermission('zones:write'), controller.reorder);

module.exports = router;
