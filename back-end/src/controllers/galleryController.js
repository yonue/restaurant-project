const { Op } = require('sequelize');
const { GalleryCategory, GalleryMedia, User } = require('../models');
const { saveGalleryBuffer, deleteStoredFile, toPublicPath } = require('../services/imageService');

const slugify = (value) => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const publicMedia = (media) => {
  const value = media.toJSON ? media.toJSON() : { ...media };
  value.file_path = toPublicPath(value.file_path) || value.file_path;
  value.thumbnail = toPublicPath(value.thumbnail) || value.thumbnail;
  return value;
};
const publicCategory = (category) => category.toJSON ? category.toJSON() : { ...category };
const parseBoolean = (value, fallback) => value === undefined ? fallback : value === true || value === 'true' || value === 1 || value === '1';

exports.listCategories = async (req, res) => {
  try {
    const where = req.query.public === 'true' ? { is_active: true } : {};
    const categories = await GalleryCategory.findAll({ where, order: [['sort_order', 'ASC'], ['name', 'ASC']] });
    res.json({ categories: categories.map(publicCategory) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, sort_order, is_active } = req.body;
    if (!String(name || '').trim()) return res.status(400).json({ message: 'Le nom est obligatoire.' });
    const slug = slugify(name);
    if (await GalleryCategory.findOne({ where: { [Op.or]: [{ name: String(name).trim() }, { slug }] } })) return res.status(409).json({ message: 'Cette catégorie existe déjà.' });
    const category = await GalleryCategory.create({ name: String(name).trim(), slug, description: description || null, sort_order: Number(sort_order || 0), is_active: parseBoolean(is_active, true) });
    res.status(201).json({ category: publicCategory(category) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.updateCategory = async (req, res) => {
  try {
    const category = await GalleryCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Catégorie introuvable.' });
    if (req.body.name !== undefined) { category.name = String(req.body.name).trim(); category.slug = slugify(category.name); }
    for (const key of ['description', 'sort_order']) if (req.body[key] !== undefined) category[key] = key === 'sort_order' ? Number(req.body[key]) : req.body[key];
    if (req.body.is_active !== undefined) category.is_active = parseBoolean(req.body.is_active, category.is_active);
    await category.save();
    res.json({ category: publicCategory(category) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await GalleryCategory.findByPk(req.params.id);
    if (!category) return res.status(404).json({ message: 'Catégorie introuvable.' });
    if (await GalleryMedia.count({ where: { category_id: category.id } })) return res.status(400).json({ message: 'Déplacez les médias avant de supprimer cette catégorie.' });
    await category.destroy();
    res.json({ message: 'Catégorie supprimée.' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.listMedia = async (req, res) => {
  try {
    const where = {};
    if (req.query.public === 'true') where.is_public = true;
    if (req.query.category_id) where.category_id = req.query.category_id;
    if (req.query.type) where.type = req.query.type;
    if (req.query.visibility === 'public') where.is_public = true;
    if (req.query.visibility === 'hidden') where.is_public = false;
    if (req.query.search) where[Op.or] = [{ title: { [Op.like]: `%${req.query.search}%` } }, { description: { [Op.like]: `%${req.query.search}%` } }];
    const categoryInclude = { model: GalleryCategory, as: 'category', ...(req.query.public === 'true' ? { where: { is_active: true }, required: true } : {}) };
    const media = await GalleryMedia.findAll({ where, include: [categoryInclude, { model: User, as: 'author', attributes: ['id', 'first_name', 'last_name'] }], order: [['sort_order', 'ASC'], ['createdAt', 'DESC']] });
    res.json({ media: media.map(publicMedia) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.getMedia = async (req, res) => {
  try { const media = await GalleryMedia.findByPk(req.params.id, { include: [{ model: GalleryCategory, as: 'category' }] }); if (!media) return res.status(404).json({ message: 'Média introuvable.' }); res.json({ media: publicMedia(media) }); } catch (error) { res.status(500).json({ message: error.message }); }
};

const mediaPayload = (req, current = {}) => ({
  category_id: req.body.category_id === undefined ? current.category_id : Number(req.body.category_id),
  title: req.body.title === undefined ? current.title : String(req.body.title).trim(),
  description: req.body.description === undefined ? current.description : req.body.description,
  alt: req.body.alt === undefined ? current.alt : req.body.alt,
  sort_order: req.body.sort_order === undefined ? current.sort_order || 0 : Number(req.body.sort_order),
  is_public: parseBoolean(req.body.is_public, current.is_public !== false),
  is_primary: parseBoolean(req.body.is_primary, current.is_primary === true),
});

exports.createMedia = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) return res.status(400).json({ message: 'Un fichier est obligatoire.' });
    const type = req.file.mimetype === 'video/mp4' ? 'video' : 'image';
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4'].includes(req.file.mimetype)) return res.status(400).json({ message: 'Format non supporté.' });
    const payload = mediaPayload(req);
    if (!payload.category_id || !payload.title) return res.status(400).json({ message: 'Catégorie et titre sont obligatoires.' });
    const filePath = await saveGalleryBuffer(req.file.buffer, req.file.mimetype, 'gallery');
    const media = await GalleryMedia.create({ ...payload, type, file_path: filePath, file_size: req.file.size, created_by: req.user?.id || null });
    res.status(201).json({ media: publicMedia(media) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.updateMedia = async (req, res) => {
  try {
    const media = await GalleryMedia.findByPk(req.params.id); if (!media) return res.status(404).json({ message: 'Média introuvable.' });
    Object.assign(media, mediaPayload(req, media));
    if (req.file?.buffer) { const next = await saveGalleryBuffer(req.file.buffer, req.file.mimetype, 'gallery'); deleteStoredFile(media.file_path); media.file_path = next; media.file_size = req.file.size; media.type = req.file.mimetype === 'video/mp4' ? 'video' : 'image'; }
    await media.save(); res.json({ media: publicMedia(media) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.deleteMedia = async (req, res) => {
  try { const media = await GalleryMedia.findByPk(req.params.id); if (!media) return res.status(404).json({ message: 'Média introuvable.' }); deleteStoredFile(media.file_path); deleteStoredFile(media.thumbnail); await media.destroy(); res.json({ message: 'Média supprimé.' }); } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.bulkUpload = async (req, res) => {
  try {
    const files = req.files || []; if (!files.length) return res.status(400).json({ message: 'Aucun fichier reçu.' });
    const categoryId = Number(req.body.category_id); if (!categoryId) return res.status(400).json({ message: 'Catégorie obligatoire.' });
    const created = [];
    for (const file of files) { const type = file.mimetype === 'video/mp4' ? 'video' : 'image'; const path = await saveGalleryBuffer(file.buffer, file.mimetype, 'gallery'); created.push(await GalleryMedia.create({ category_id: categoryId, type, title: file.originalname.replace(/\.[^.]+$/, ''), alt: file.originalname, file_path: path, file_size: file.size, created_by: req.user?.id || null })); }
    res.status(201).json({ media: created.map(publicMedia) });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.reorderMedia = async (req, res) => {
  try { const ids = Array.isArray(req.body.ids) ? req.body.ids : []; await Promise.all(ids.map((id, index) => GalleryMedia.update({ sort_order: index }, { where: { id } }))); res.json({ message: 'Ordre enregistré.' }); } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.bulkAction = async (req, res) => {
  try { const ids = Array.isArray(req.body.ids) ? req.body.ids : []; const values = {}; if (req.body.category_id) values.category_id = Number(req.body.category_id); if (req.body.action === 'publish') values.is_public = true; if (req.body.action === 'hide') values.is_public = false; if (!Object.keys(values).length) return res.status(400).json({ message: 'Action invalide.' }); await GalleryMedia.update(values, { where: { id: ids } }); res.json({ message: 'Médias mis à jour.' }); } catch (error) { res.status(500).json({ message: error.message }); }
};
