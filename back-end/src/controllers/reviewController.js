const { Avis, Product, User } = require('../models');
const { logActivity } = require('../services/activityLogService');
const { hasAnyRole } = require('../utils/roles');

function normalizeReview(reviewInstance) {
  if (!reviewInstance) {
    return null;
  }

  const raw = reviewInstance.toJSON ? reviewInstance.toJSON() : { ...reviewInstance };
  return {
    ...raw,
    customerName: raw.guest_name
      || (raw.user ? `${raw.user.first_name || ''} ${raw.user.last_name || ''}`.trim() : 'Client'),
    dishName: raw.product?.name || null,
    date: raw.date || (raw.createdAt
      ? new Date(raw.createdAt).toISOString().split('T')[0]
      : null),
    adminReply: raw.admin_reply || null,
    repliedAt: raw.replied_at || null,
    isArchived: Boolean(raw.is_archived),
  };
}

function isAdmin(user) {
  return hasAnyRole(user, ['Administrator', 'Manager']);
}

async function loadReviewById(id) {
  return Avis.findByPk(id, {
    include: [
      { model: User, as: 'user' },
      { model: Product, as: 'product' },
    ],
  });
}

exports.createGuestReview = async (req, res) => {
  try {
    const { guest_name, rating, comment, produit_id } = req.body;

    if (!guest_name || rating === undefined) {
      return res.status(400).json({
        message: 'guest_name et rating sont obligatoires.',
      });
    }

    const reviewRating = Number(rating);
    if (Number.isNaN(reviewRating) || reviewRating < 1 || reviewRating > 5) {
      return res.status(400).json({
        message: 'rating doit être compris entre 1 et 5.',
      });
    }

    if (produit_id) {
      const product = await Product.findByPk(produit_id);
      if (!product) {
        return res.status(404).json({ message: 'Produit introuvable.' });
      }
    }

    const review = await Avis.create({
      user_id: null,
      guest_name: String(guest_name).trim(),
      produit_id: produit_id || null,
      rating: reviewRating,
      comment: comment || null,
      status: 'PENDING',
      is_approved: false,
    });

    return res.status(201).json({
      message: 'Avis ajouté avec succès. En attente de validation.',
      review: normalizeReview(review),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getPublicReviews = async (req, res) => {
  try {
    const reviews = await Avis.findAll({
      where: { status: 'APPROVED' },
      include: [
        { model: User, as: 'user' },
        { model: Product, as: 'product' },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      reviews: reviews.map(normalizeReview),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { produit_id, rating, comment } = req.body;

    if (!produit_id || rating === undefined) {
      return res.status(400).json({
        message: 'produit_id et rating sont obligatoires.',
      });
    }

    const product = await Product.findByPk(produit_id);
    if (!product) {
      return res.status(404).json({ message: 'Produit introuvable.' });
    }

    const reviewRating = Number(rating);
    if (Number.isNaN(reviewRating) || reviewRating < 1 || reviewRating > 5) {
      return res.status(400).json({
        message: 'rating doit être compris entre 1 et 5.',
      });
    }

    const existingReview = await Avis.findOne({
      where: {
        user_id: userId,
        produit_id,
      },
    });

    if (existingReview) {
      return res.status(400).json({
        message: 'Vous avez déjà laissé un avis sur ce produit.',
      });
    }

    const review = await Avis.create({
      user_id: userId,
      produit_id,
      rating: reviewRating,
      comment: comment || null,
      status: 'PENDING',
      is_approved: false,
    });

    await logActivity({
      userId,
      action: 'REVIEW_CREATED',
      entity: 'Review',
      entityId: review.id,
    });

    return res.status(201).json({
      message: 'Avis ajouté avec succès. En attente de validation.',
      review: normalizeReview(review),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await loadReviewById(id);

    if (!review) {
      return res.status(404).json({ message: 'Avis introuvable.' });
    }

    if (review.user_id && review.user_id !== req.user.id && !isAdmin(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { rating, comment, admin_reply, is_archived, status } = req.body;

    if (rating !== undefined) {
      const reviewRating = Number(rating);
      if (Number.isNaN(reviewRating) || reviewRating < 1 || reviewRating > 5) {
        return res.status(400).json({
          message: 'rating doit être compris entre 1 et 5.',
        });
      }
      review.rating = reviewRating;
    }

    if (comment !== undefined) {
      review.comment = comment;
    }
    if (admin_reply !== undefined) {
      review.admin_reply = admin_reply || null;
      review.replied_at = admin_reply ? new Date() : null;
    }
    if (is_archived !== undefined) review.is_archived = Boolean(is_archived);
    if (status !== undefined && isAdmin(req.user)) {
      if (!['PENDING', 'APPROVED', 'REFUSED'].includes(status)) return res.status(400).json({ message: 'Statut invalide.' });
      review.status = status;
      review.is_approved = status === 'APPROVED';
    }

    if (review.status !== 'PENDING' && !isAdmin(req.user)) {
      return res.status(400).json({
        message: 'Un avis déjà traité ne peut pas être modifié par le client.',
      });
    }

    await review.save();
    await logActivity({
      userId: req.user.id,
      action: 'REVIEW_UPDATED',
      entity: 'Review',
      entityId: review.id,
    });

    return res.status(200).json({
      message: 'Avis mis à jour.',
      review: normalizeReview(review),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await Avis.findByPk(id);

    if (!review) {
      return res.status(404).json({ message: 'Avis introuvable.' });
    }

    if (review.user_id && review.user_id !== req.user.id && !isAdmin(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    await review.destroy();
    await logActivity({
      userId: req.user.id,
      action: 'REVIEW_DELETED',
      entity: 'Review',
      entityId: review.id,
    });

    return res.status(200).json({ message: 'Avis supprimé.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllReviews = async (req, res) => {
  try {
    const where = isAdmin(req.user) ? {} : { status: 'APPROVED' };

    const reviews = await Avis.findAll({
      where,
      include: [
        { model: User, as: 'user' },
        { model: Product, as: 'product' },
      ],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      reviews: reviews.map(normalizeReview),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getReviewById = async (req, res) => {
  try {
    const { id } = req.params;
    const review = await loadReviewById(id);

    if (!review) {
      return res.status(404).json({ message: 'Avis introuvable.' });
    }

    if (!isAdmin(req.user) && review.user_id !== req.user.id && review.status !== 'APPROVED') {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    return res.status(200).json({ review: normalizeReview(review) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getMyReviews = async (req, res) => {
  try {
    const reviews = await Avis.findAll({
      where: { user_id: req.user.id },
      include: [{ model: Product, as: 'product' }],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      reviews: reviews.map(normalizeReview),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.approveReview = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const review = await Avis.findByPk(id);

    if (!review) {
      return res.status(404).json({ message: 'Avis introuvable.' });
    }

    review.status = 'APPROVED';
    review.is_approved = true;
    await review.save();
    await logActivity({
      userId: req.user.id,
      action: 'REVIEW_APPROVED',
      entity: 'Review',
      entityId: review.id,
    });

    return res.status(200).json({
      message: 'Avis validé.',
      review: normalizeReview(review),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.refuseReview = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const review = await Avis.findByPk(id);

    if (!review) {
      return res.status(404).json({ message: 'Avis introuvable.' });
    }

    review.status = 'REFUSED';
    review.is_approved = false;
    await review.save();
    await logActivity({
      userId: req.user.id,
      action: 'REVIEW_REFUSED',
      entity: 'Review',
      entityId: review.id,
    });

    return res.status(200).json({
      message: 'Avis refusé.',
      review: normalizeReview(review),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
