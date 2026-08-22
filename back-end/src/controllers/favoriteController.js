const { Favorite, Product } = require('../models');

function normalizeFavorite(favoriteInstance) {
  if (!favoriteInstance) {
    return null;
  }

  return favoriteInstance.toJSON ? favoriteInstance.toJSON() : { ...favoriteInstance };
}

exports.addFavorite = async (req, res) => {
  try {
    const userId = req.user.id;
    const { produit_id } = req.body;

    if (!produit_id) {
      return res.status(400).json({ message: 'produit_id est obligatoire.' });
    }

    const product = await Product.findByPk(produit_id);
    if (!product) {
      return res.status(404).json({ message: 'Produit introuvable.' });
    }

    const existingFavorite = await Favorite.findOne({
      where: { user_id: userId, produit_id },
    });

    if (existingFavorite) {
      return res.status(400).json({ message: 'Ce produit est déjà dans vos favoris.' });
    }

    const favorite = await Favorite.create({
      user_id: userId,
      produit_id,
    });

    return res.status(201).json({
      message: 'Produit ajouté aux favoris.',
      favorite: normalizeFavorite(favorite),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    const { id } = req.params;
    const favorite = await Favorite.findOne({
      where: { id, user_id: req.user.id },
    });

    if (!favorite) {
      return res.status(404).json({ message: 'Favori introuvable.' });
    }

    await favorite.destroy();

    return res.status(200).json({ message: 'Produit retiré des favoris.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getMyFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.findAll({
      where: { user_id: req.user.id },
      include: [{ model: Product, as: 'product' }],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      favorites: favorites.map(normalizeFavorite),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.checkFavorite = async (req, res) => {
  try {
    const { produit_id } = req.params;
    const favorite = await Favorite.findOne({
      where: { user_id: req.user.id, produit_id },
    });

    return res.status(200).json({
      isFavorite: Boolean(favorite),
      favorite: favorite ? normalizeFavorite(favorite) : null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
