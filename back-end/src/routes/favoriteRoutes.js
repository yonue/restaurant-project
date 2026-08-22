const express = require('express');
const authenticate = require('../middlewares/authenticate');
const favoriteController = require('../controllers/favoriteController');

const router = express.Router();

router.use(authenticate);

router.post('/', favoriteController.addFavorite);
router.get('/', favoriteController.getMyFavorites);
router.get('/check/:produit_id', favoriteController.checkFavorite);
router.delete('/:id', favoriteController.removeFavorite);

module.exports = router;
