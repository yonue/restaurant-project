const express = require('express');
const authenticate = require('../middlewares/authenticate');
const reservationController = require('../controllers/reservationController');
const { requireRole } = require('../middlewares/verify_role');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

// Public guest reservation (no authentication required)
router.post('/guest', reservationController.createGuestReservation);
router.get('/available-tables', reservationController.getAvailableTables);

router.use(authenticate);

router.post('/', requirePermission('reservations:write'), reservationController.createReservation);
router.get('/mine', reservationController.getMyReservations);
router.get('/:id', requirePermission('reservations:read'), reservationController.getReservationById);

router.get('/', requirePermission('reservations:read'), reservationController.getAllReservations);
router.put('/:id', requirePermission('reservations:write'), reservationController.updateReservation);
router.patch('/:id/cancel', requirePermission('reservations:write'), reservationController.cancelReservation);
router.patch('/:id/accept', requirePermission('reservations:write'), reservationController.acceptReservation);
router.patch('/:id/refuse', requirePermission('reservations:write'), reservationController.refuseReservation);
router.patch('/:id/postpone', requirePermission('reservations:write'), reservationController.postponeReservation);

module.exports = router;
