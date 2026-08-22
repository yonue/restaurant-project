const express = require('express');
const authenticate = require('../middlewares/authenticate');
const orderController = require('../controllers/orderController');
const { requireRole } = require('../middlewares/verify_role');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

router.use(authenticate);

router.post('/', requirePermission('orders:write'), orderController.createOrder);
router.get('/mine', orderController.getMyOrders);
router.get('/:id', requirePermission('orders:read'), orderController.getOrderById);

router.get('/', requirePermission('orders:read'), orderController.getAllOrders);
router.patch('/:id/status', requirePermission('orders:write'), orderController.updateOrderStatus);
router.delete('/:id', requirePermission('orders:write'), orderController.deleteOrder);

module.exports = router;
