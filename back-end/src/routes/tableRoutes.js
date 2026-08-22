const express = require('express');
const authenticate = require('../middlewares/authenticate');
const tableController = require('../controllers/tableController');
const { requireRole } = require('../middlewares/verify_role');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

router.use(authenticate);
router.use(requirePermission('tables:read'));

router.post('/', requirePermission('tables:write'), tableController.createTable);
router.get('/', tableController.getAllTables);
router.get('/:id', tableController.getTableById);
router.put('/:id', requirePermission('tables:write'), tableController.updateTable);
router.delete('/:id', requirePermission('tables:write'), tableController.deleteTable);
router.patch('/:id/sync-status', requirePermission('tables:write'), tableController.syncTableStatus);

module.exports = router;
