const { Op } = require('sequelize');
const { RestaurantZone, RestaurantTable, Reservation } = require('../models');
const { saveGalleryBuffer, deleteStoredFile, toPublicPath } = require('../services/imageService');

const normalize = (zone) => {
  const value = zone?.toJSON ? zone.toJSON() : { ...zone };
  value.image_url = value.image_path && /^https?:\/\//i.test(value.image_path) ? value.image_path : toPublicPath(value.image_path) || value.image_path || null;
  return value;
};
const parseBoolean = (value, fallback = true) => value === undefined ? fallback : value === true || value === 'true' || value === '1' || value === 1;

exports.list = async (req, res) => {
  try {
    const zones = await RestaurantZone.findAll({
      include: [{ model: RestaurantTable, as: 'tables', attributes: ['id', 'table_number', 'capacity', 'status', 'is_active'] }],
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
    });
    return res.json({ zones: zones.map(normalize) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.publicList = async (_req, res) => {
  try {
    const zones = await RestaurantZone.findAll({ where: { is_active: true }, order: [['sort_order', 'ASC'], ['name', 'ASC']] });
    return res.json({ zones: zones.map(normalize) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.get = async (req, res) => {
  try {
    const zone = await RestaurantZone.findByPk(req.params.id, { include: [{ model: RestaurantTable, as: 'tables' }] });
    if (!zone) return res.status(404).json({ message: 'Zone introuvable.' });
    return res.json({ zone: normalize(zone) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

function validate(payload) {
  const name = String(payload.name || '').trim();
  if (!name) return { error: 'Le nom de la zone est obligatoire.' };
  const max = payload.max_capacity === '' || payload.max_capacity == null ? null : Number(payload.max_capacity);
  const min = payload.min_capacity === '' || payload.min_capacity == null ? null : Number(payload.min_capacity);
  if (min !== null && (!Number.isInteger(min) || min < 0) || max !== null && (!Number.isInteger(max) || max < 0)) return { error: 'Les capacités doivent être des nombres positifs.' };
  if (min !== null && max !== null && min > max) return { error: 'La capacité minimale ne peut pas dépasser la capacité maximale.' };
  return { values: { name, description: payload.description || null, icon: payload.icon || null, min_capacity: min, max_capacity: max, is_active: parseBoolean(payload.is_active, true), sort_order: Number(payload.sort_order || 0) } };
}

exports.create = async (req, res) => {
  try {
    const result = validate(req.body);
    if (result.error) return res.status(400).json({ message: result.error });
    const duplicate = await RestaurantZone.findOne({ where: { name: result.values.name } });
    if (duplicate) return res.status(409).json({ message: 'Cette zone existe déjà.' });
    const zone = await RestaurantZone.create(result.values);
    if (req.file?.buffer) {
      zone.image_path = await saveGalleryBuffer(req.file.buffer, req.file.mimetype, 'zone');
      await zone.save();
    }
    return res.status(201).json({ message: 'Zone créée.', zone: normalize(zone) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const zone = await RestaurantZone.findByPk(req.params.id);
    if (!zone) return res.status(404).json({ message: 'Zone introuvable.' });
    const result = validate({ ...zone.toJSON(), ...req.body });
    if (result.error) return res.status(400).json({ message: result.error });
    const duplicate = await RestaurantZone.findOne({ where: { name: result.values.name, id: { [Op.ne]: zone.id } } });
    if (duplicate) return res.status(409).json({ message: 'Cette zone existe déjà.' });
    await zone.update(result.values);
    if (req.file?.buffer) {
      const nextImage = await saveGalleryBuffer(req.file.buffer, req.file.mimetype, 'zone');
      deleteStoredFile(zone.image_path);
      zone.image_path = nextImage;
      await zone.save();
    } else if (parseBoolean(req.body.remove_image, false)) {
      deleteStoredFile(zone.image_path);
      zone.image_path = null;
      await zone.save();
    }
    return res.json({ message: 'Zone mise à jour.', zone: normalize(zone) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const zone = await RestaurantZone.findByPk(req.params.id);
    if (!zone) return res.status(404).json({ message: 'Zone introuvable.' });
    const tables = await RestaurantTable.count({ where: { zone_id: zone.id } });
    if (tables) return res.status(409).json({ message: 'Déplacez les tables de cette zone avant de la supprimer.' });
    deleteStoredFile(zone.image_path);
    await zone.destroy();
    return res.json({ message: 'Zone supprimée.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.reorder = async (req, res) => {
  try {
    const items = Array.isArray(req.body.zones) ? req.body.zones : [];
    await Promise.all(items.map((item, index) => RestaurantZone.update({ sort_order: index }, { where: { id: item.id } })));
    return res.json({ message: 'Ordre sauvegardé.' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
