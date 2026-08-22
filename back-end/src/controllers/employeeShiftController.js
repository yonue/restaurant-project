const { EmployeeShift, Employee } = require('../models');
const { hasAnyRole } = require('../utils/roles');
const allowed = user => hasAnyRole(user, ['Administrator', 'Manager']);

exports.list = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  const where = req.query.employee_id ? { employee_id: req.query.employee_id } : {};
  const shifts = await EmployeeShift.findAll({ where, order: [['shift_date', 'ASC'], ['start_time', 'ASC']] });
  res.json({ shifts });
};
exports.create = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  const { employee_id, shift_date, start_time, end_time, role, notes } = req.body;
  if (!employee_id || !shift_date || !start_time || !end_time) return res.status(400).json({ message: 'Employé, date et horaires sont obligatoires.' });
  if (!/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time) || start_time >= end_time) return res.status(400).json({ message: 'Les horaires du service sont invalides.' });
  if (!(await Employee.findByPk(employee_id))) return res.status(404).json({ message: 'Employé introuvable.' });
  const shift = await EmployeeShift.create({ employee_id, shift_date, start_time, end_time, role, notes });
  res.status(201).json({ shift });
};
exports.update = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  const shift = await EmployeeShift.findByPk(req.params.id);
  if (!shift) return res.status(404).json({ message: 'Service introuvable.' });
  const next = { ...shift.toJSON(), ...req.body };
  if (!next.shift_date || !/^\d{2}:\d{2}$/.test(next.start_time) || !/^\d{2}:\d{2}$/.test(next.end_time) || next.start_time >= next.end_time) return res.status(400).json({ message: 'Les horaires du service sont invalides.' });
  await shift.update({ shift_date: next.shift_date, start_time: next.start_time, end_time: next.end_time, role: next.role || null, notes: next.notes || null });
  res.json({ shift });
};
exports.remove = async (req, res) => {
  if (!allowed(req.user)) return res.status(403).json({ message: 'Accès refusé.' });
  const shift = await EmployeeShift.findByPk(req.params.id);
  if (!shift) return res.status(404).json({ message: 'Service introuvable.' });
  await shift.destroy(); res.json({ message: 'Service supprimé.' });
};
