const { sequelize, SpecialOpening } = require('../models');
const service = require('../services/businessHoursService');
const { hasAnyRole } = require('../utils/roles');

const allowed = user => hasAnyRole(user, ['Administrator', 'Manager']);

exports.public = async (_req, res) => {
  try { res.json(await service.getPublicSchedule()); } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.manage = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  try { res.json(await service.getPublicSchedule()); } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.saveSchedule = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  const transaction = await sequelize.transaction();
  try {
    await service.saveWeeklyHours(req.body.days, transaction);
    if (Array.isArray(req.body.exceptions)) {
      const keepIds = req.body.exceptions.map(item => Number(item.id)).filter(Boolean);
      await SpecialOpening.destroy({ where: keepIds.length ? { id: { [require('sequelize').Op.notIn]: keepIds } } : {}, transaction });
      for (const item of req.body.exceptions) await service.saveSpecialOpening(item, transaction);
    }
    await transaction.commit();
    res.json(await service.getPublicSchedule());
  } catch (error) { await transaction.rollback(); res.status(400).json({ message: error.message }); }
};

exports.createException = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  try { res.status(201).json({ exception: await service.saveSpecialOpening(req.body) }); } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.updateException = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  try { const row = await SpecialOpening.findByPk(req.params.id); if (!row) return res.status(404).json({ message: 'Exception introuvable.' }); await row.destroy(); const exception = await service.saveSpecialOpening(req.body); res.json({ exception }); } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.deleteException = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  try { const deleted = await SpecialOpening.destroy({ where: { id: req.params.id } }); if (!deleted) return res.status(404).json({ message: 'Exception introuvable.' }); res.json({ message: 'Exception supprimée.' }); } catch (error) { res.status(500).json({ message: error.message }); }
};
