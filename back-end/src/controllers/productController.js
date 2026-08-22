const { Product, Category } = require('../models');
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

function parseListValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (error) {
      // Fall through to comma-separated parsing.
    }
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return null;
}

function normalizeProduct(productInstance) {
  if (!productInstance) {
    return null;
  }

  const product = productInstance.toJSON ? productInstance.toJSON() : { ...productInstance };
  if (product.image) {
    product.image = toPublicPath(product.image);
  }
  if (typeof product.ingredients === 'string') {
    try {
      product.ingredients = JSON.parse(product.ingredients);
    } catch (error) {
      product.ingredients = product.ingredients.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  if (typeof product.allergens === 'string') {
    try {
      product.allergens = JSON.parse(product.allergens);
    } catch (error) {
      product.allergens = product.allergens.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return product;
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

async function applyProductImage(product, imageInput) {
  if (!imageInput) {
    return;
  }

  const nextImagePath = imageInput.buffer
    ? await saveBufferImage(imageInput.buffer, imageInput.mimeType, 'product')
    : imageInput.base64
      ? await saveBase64Image(imageInput.base64, 'product')
      : imageInput.url || null;

  if (nextImagePath && nextImagePath !== product.image) {
    deleteStoredFile(product.image);
    product.image = nextImagePath;
  }
}

exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      category_id,
      preparation_time,
      ingredients,
      allergens,
      is_available,
    } = req.body;
    const image = resolveIncomingImage(req);

    if (!name || price === undefined || !category_id) {
      return res.status(400).json({
        message: 'name, price et category_id sont obligatoires.',
      });
    }

    const category = await Category.findByPk(category_id);
    if (!category) {
      return res.status(400).json({ message: 'Catégorie introuvable.' });
    }

    const product = await Product.create({
      name,
      description: description || null,
      price,
      category_id,
      preparation_time: preparation_time || null,
      ingredients: parseListValue(ingredients) ? JSON.stringify(parseListValue(ingredients)) : null,
      allergens: parseListValue(allergens) ? JSON.stringify(parseListValue(allergens)) : null,
      is_available: typeof is_available === 'boolean' ? is_available : true,
      image: null,
    });

    await applyProductImage(product, image);
    await product.save();

    return res.status(201).json({
      message: 'Plat créé avec succès.',
      product: normalizeProduct(product),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      include: [{ model: Category, as: 'category' }],
      order: [['createdAt', 'DESC']],
    });

    return res.status(200).json({
      products: products.map(normalizeProduct),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id, {
      include: [{ model: Category, as: 'category' }],
    });

    if (!product) {
      return res.status(404).json({ message: 'Plat introuvable.' });
    }

    return res.status(200).json({ product: normalizeProduct(product) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({ message: 'Plat introuvable.' });
    }

    const {
      name,
      description,
      price,
      category_id,
      preparation_time,
      ingredients,
      allergens,
      is_available,
    } = req.body;
    const image = resolveIncomingImage(req);

    if (category_id) {
      const category = await Category.findByPk(category_id);
      if (!category) {
        return res.status(400).json({ message: 'Catégorie introuvable.' });
      }
    }

    product.name = name ?? product.name;
    product.description = description ?? product.description;
    product.price = price ?? product.price;
    product.category_id = category_id ?? product.category_id;
    product.preparation_time = preparation_time ?? product.preparation_time;
    const nextIngredients = parseListValue(ingredients);
    const nextAllergens = parseListValue(allergens);
    product.ingredients = nextIngredients ? JSON.stringify(nextIngredients) : product.ingredients;
    product.allergens = nextAllergens ? JSON.stringify(nextAllergens) : product.allergens;
    product.is_available = typeof is_available === 'boolean' ? is_available : product.is_available;

    await applyProductImage(product, image);
    await product.save();

    return res.status(200).json({
      message: 'Plat mis à jour.',
      product: normalizeProduct(product),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({ message: 'Plat introuvable.' });
    }

    deleteStoredFile(product.image);
    await product.destroy();

    return res.status(200).json({ message: 'Plat supprimé.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.toggleAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id);

    if (!product) {
      return res.status(404).json({ message: 'Plat introuvable.' });
    }

    product.is_available = !product.is_available;
    await product.save();

    return res.status(200).json({
      message: `Plat ${product.is_available ? 'activé' : 'désactivé'}.`,
      product: normalizeProduct(product),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.uploadImage = async (req, res) => {
  try {
    const { type, id } = req.params;
    const image = req.file?.buffer
      ? { buffer: req.file.buffer, mimeType: req.file.mimetype }
      : req.body.image || req.body.imageData;

    if (!image) {
      return res.status(400).json({ message: 'Une image base64 est requise.' });
    }

    if (type === 'category') {
      const category = await Category.findByPk(id);
      if (!category) {
        return res.status(404).json({ message: 'Catégorie introuvable.' });
      }

      const nextImage = image.buffer
        ? await saveBufferImage(image.buffer, image.mimeType, 'category')
        : await saveBase64Image(image, 'category');
      deleteStoredFile(category.image);
      category.image = nextImage;
      await category.save();

      return res.status(200).json({
        message: 'Image de catégorie uploadée.',
        category: normalizeCategory(category),
      });
    }

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ message: 'Plat introuvable.' });
    }

    const nextImage = image.buffer
      ? await saveBufferImage(image.buffer, image.mimeType, 'product')
      : await saveBase64Image(image, 'product');
    deleteStoredFile(product.image);
    product.image = nextImage;
    await product.save();

    return res.status(200).json({
      message: 'Image du plat uploadée.',
      product: normalizeProduct(product),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.removeImage = async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type === 'category') {
      const category = await Category.findByPk(id);
      if (!category) {
        return res.status(404).json({ message: 'Catégorie introuvable.' });
      }

      deleteStoredFile(category.image);
      category.image = null;
      await category.save();

      return res.status(200).json({
        message: 'Image de catégorie supprimée.',
        category: normalizeCategory(category),
      });
    }

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ message: 'Plat introuvable.' });
    }

    deleteStoredFile(product.image);
    product.image = null;
    await product.save();

    return res.status(200).json({
      message: 'Image du plat supprimée.',
      product: normalizeProduct(product),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
