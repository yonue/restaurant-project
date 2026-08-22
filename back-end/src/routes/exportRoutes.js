const express = require('express');
const authenticate = require('../middlewares/authenticate');
const exportController = require('../controllers/exportController');
const { requireRole } = require('../middlewares/verify_role');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('Administrator', 'Manager'));

router.get('/orders', requirePermission('orders:write'), exportController.exportOrders);
router.get('/reservations', requirePermission('reservations:write'), exportController.exportReservations);

module.exports = router;
