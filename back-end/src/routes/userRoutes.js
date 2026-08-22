const express = require('express');
const authenticate = require('../middlewares/authenticate');
const userController = require('../controllers/userController');
const { requireRole } = require('../middlewares/verify_role');
const { requirePermission, denyRoleMutation } = require('../middlewares/permissions');

const router = express.Router();

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/change-password', userController.changePassword);
router.patch('/avatar', userController.uploadAvatar);
router.get('/reservations/history', userController.getReservationHistory);

router.use(requirePermission('customers:read'));

router.post('/', requirePermission('customers:write'), denyRoleMutation, userController.createUser);
router.get('/', userController.getAllUsers);
router.get('/:id', userController.getUserById);
router.put('/:id', requirePermission('customers:write'), denyRoleMutation, userController.updateUser);
router.delete('/:id', requirePermission('customers:write'), userController.deleteUser);

module.exports = router;
