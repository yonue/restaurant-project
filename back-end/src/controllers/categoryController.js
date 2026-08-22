const { Category, Product } = require('../models');
const { saveBase64Image, saveBufferImage, deleteStoredFile, toPublicPath } = require('../services/imageService');

function resolveIncomingImage(req) {
  if (req.file && req.file.buffer) {
    return {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
    };
  }

  if (req.body.image) {
    const img = String(req.body.image).trim();
    if (!img) {
      return null;
    }
    if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('/uploads')) {
      return { url: img };
    }
    return { base64: img };
  }

  return null;
}

function normalizeCategory(categoryInstance) {
  if (!categoryInstance) {
    return null;
  }

  const category = categoryInstance.toJSON ? categoryInstance.toJSON() : { ...categoryInstance };
  if (category.image) {
    category.image = toPublicPath(category.image);
  }
  return category;
}

async function applyCategoryImage(category, imageInput) {
  if (!imageInput) {
    return;
  }

  const nextImagePath = imageInput.buffer
    ? await saveBufferImage(imageInput.buffer, imageInput.mimeType, 'category')
    : imageInput.base64
      ? await saveBase64Image(imageInput.base64, 'category')
      : imageInput.url || null;

  if (nextImagePath && nextImagePath !== category.image) {
    deleteStoredFile(category.image);
    category.image = nextImagePath;
  }
}

exports.createCategory = async (req, res) => {
  try {
    const { name, description, sort_order, is_active } = req.body;
    const image = resolveIncomingImage(req);

    if (!name) {
      return res.status(400).json({ message: 'Le nom de la catégorie est obligatoire.' });
    }

    const existingCategory = await Category.findOne({ where: { name } });
    if (existingCategory) {
      return res.status(400).json({ message: 'Cette catégorie existe déjà.' });
    }

    const last = await Category.max('sort_order');
    const category = await Category.create({
      name,
      description: description || null,
      image: null,
      sort_order: sort_order === undefined ? (Number(last) || 0) + 1 : Number(sort_order),
      is_active: is_active !== false,
    });

    await applyCategoryImage(category, image);
    await category.save();

    return res.status(201).json({
      message: 'Catégorie créée avec succès.',
      category: normalizeCategory(category),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.findAll({
      include: [{ model: Product, as: 'products' }],
      order: [['sort_order', 'ASC'], ['createdAt', 'ASC']],
    });

    return res.status(200).json({
      categories: categories.map(normalizeCategory),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id, {
      include: [{ model: Product, as: 'products' }],
    });

    if (!category) {
      return res.status(404).json({ message: 'Catégorie introuvable.' });
    }

    return res.status(200).json({ category: normalizeCategory(category) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);

    if (!category) {
      return res.status(404).json({ message: 'Catégorie introuvable.' });
    }

    const { name, description, sort_order, is_active } = req.body;
    const image = resolveIncomingImage(req);

    if (name && name !== category.name) {
      const existingCategory = await Category.findOne({ where: { name } });
      if (existingCategory) {
        return res.status(400).json({ message: 'Cette catégorie existe déjà.' });
      }
    }

    category.name = name ?? category.name;
    category.description = description ?? category.description;
    if (sort_order !== undefined) category.sort_order = Number(sort_order);
    if (is_active !== undefined) category.is_active = Boolean(is_active);

    await applyCategoryImage(category, image);
    await category.save();

    return res.status(200).json({
      message: 'Catégorie mise à jour.',
      category: normalizeCategory(category),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const category = await Category.findByPk(id);

    if (!category) {
      return res.status(404).json({ message: 'Catégorie introuvable.' });
    }

    const linkedProducts = await Product.count({ where: { category_id: category.id } });
    if (linkedProducts > 0) {
      return res.status(400).json({
        message: 'Impossible de supprimer cette catégorie tant qu’elle contient des produits.',
      });
    }

    deleteStoredFile(category.image);
    await category.destroy();

    return res.status(200).json({ message: 'Catégorie supprimée.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
