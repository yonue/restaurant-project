const express = require('express');
const authenticate = require('../middlewares/authenticate');
const dashboardController = require('../controllers/dashboardController');
const { requireRole } = require('../middlewares/verify_role');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

router.use(authenticate);
router.use(requireRole('Administrator', 'Manager'));

router.get('/overview', requirePermission('dashboard:read'), dashboardController.getOverview);
router.get('/charts', requirePermission('analytics:read'), dashboardController.getCharts);
router.get('/logs', requirePermission('audit:read'), dashboardController.getActivityLogs);
router.get('/settings', requirePermission('settings:read'), dashboardController.getSettings);
router.put('/settings', requirePermission('settings:write'), dashboardController.updateSettings);

module.exports = router;
