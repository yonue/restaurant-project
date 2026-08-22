const express = require('express');
const authenticate = require('../middlewares/authenticate');
const employeeController = require('../controllers/employeeController');
const { requireRole } = require('../middlewares/verify_role');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

router.use(authenticate);
router.use(requirePermission('employees:read'));

router.post('/', requirePermission('employees:write'), employeeController.createEmployee);
router.get('/', employeeController.getAllEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.put('/:id', requirePermission('employees:write'), employeeController.updateEmployee);
router.delete('/:id', requirePermission('employees:write'), employeeController.deleteEmployee);

module.exports = router;
