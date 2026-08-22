const express = require('express');
const authenticate = require('../middlewares/authenticate');
const reviewController = require('../controllers/reviewController');
const { requirePermission } = require('../middlewares/permissions');

const router = express.Router();

// Public routes (no authentication)
router.get('/public', reviewController.getPublicReviews);
router.post('/guest', reviewController.createGuestReview);

router.use(authenticate);

router.post('/', requirePermission('reviews:write'), reviewController.createReview);
router.get('/mine', reviewController.getMyReviews);
router.get('/', requirePermission('reviews:read'), reviewController.getAllReviews);
router.get('/:id', requirePermission('reviews:read'), reviewController.getReviewById);
router.put('/:id', requirePermission('reviews:write'), reviewController.updateReview);
router.delete('/:id', requirePermission('reviews:write'), reviewController.deleteReview);
router.patch('/:id/approve', requirePermission('reviews:write'), reviewController.approveReview);
router.patch('/:id/refuse', requirePermission('reviews:write'), reviewController.refuseReview);

module.exports = router;
