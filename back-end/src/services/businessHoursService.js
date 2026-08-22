const { Op } = require('sequelize');
const { BusinessHour, BusinessHourPeriod, SpecialOpening } = require('../models');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const dateOnly = value => String(value || '').slice(0, 10);

function normalizeSlots(slots) {
  if (!Array.isArray(slots)) return [];
  return slots.filter(slot => validTime(slot?.start) && validTime(slot?.end) && slot.start < slot.end)
    .map((slot, index) => ({ start: slot.start, end: slot.end, sort_order: index }));
}

async function getWeeklyHours() {
  const rows = await BusinessHour.findAll({ include: [{ model: BusinessHourPeriod, as: 'periods', order: [['sort_order', 'ASC']] }], order: [['day_of_week', 'ASC']] });
  const result = {};
  for (let day = 0; day < 7; day += 1) {
    const row = rows.find(item => Number(item.day_of_week) === day);
    result[DAYS[day]] = { day_of_week: day, is_closed: row ? Boolean(row.is_closed) : true, slots: row ? row.periods.map(period => ({ start: period.start_time, end: period.end_time })) : [] };
  }
  return result;
}

async function getSpecialOpenings() {
  const rows = await SpecialOpening.findAll({ order: [['date', 'ASC']] });
  return rows.map(row => ({ ...row.toJSON(), slots: row.slots ? JSON.parse(row.slots) : [] }));
}

async function getPublicSchedule() {
  return { days: await getWeeklyHours(), exceptions: await getSpecialOpenings() };
}

async function saveWeeklyHours(days, transaction) {
  if (!days || typeof days !== 'object') throw new Error('Les horaires sont invalides.');
  for (let day = 0; day < 7; day += 1) {
    const key = DAYS[day];
    const input = days[key] || days[day] || {};
    const slots = normalizeSlots(input.slots);
    const isClosed = input.is_closed === true || input.isClosed === true || (!slots.length && input.is_closed !== false && input.isClosed !== false);
    const [row] = await BusinessHour.findOrCreate({ where: { day_of_week: day }, defaults: { day_of_week: day, is_closed: isClosed, sort_order: day }, transaction });
    await row.update({ is_closed: isClosed, sort_order: day }, { transaction });
    await BusinessHourPeriod.destroy({ where: { business_hour_id: row.id }, transaction });
    if (!isClosed) await BusinessHourPeriod.bulkCreate(slots.map(slot => ({ business_hour_id: row.id, start_time: slot.start, end_time: slot.end, sort_order: slot.sort_order })), { transaction });
  }
}

async function saveSpecialOpening(input, transaction) {
  const date = dateOnly(input.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('La date est invalide.');
  const slots = normalizeSlots(input.slots || (input.opening_time && input.closing_time ? [{ start: input.opening_time, end: input.closing_time }] : []));
  const isClosed = input.is_closed === true || (!slots.length && input.is_closed !== false);
  const [row] = await SpecialOpening.findOrCreate({ where: { date }, defaults: { date, is_closed: isClosed, title: input.title || null, description: input.description || null, slots: JSON.stringify(slots) }, transaction });
  await row.update({ opening_time: slots[0]?.start || null, closing_time: slots[0]?.end || null, is_closed: isClosed, title: input.title || null, description: input.description || null, slots: JSON.stringify(slots) }, { transaction });
  return row;
}

async function getWindowsForDate(date) {
  const key = dateOnly(date);
  const special = await SpecialOpening.findOne({ where: { date: key } });
  if (special) return { closed: Boolean(special.is_closed), slots: special.slots ? JSON.parse(special.slots) : (special.opening_time && special.closing_time ? [{ start: special.opening_time, end: special.closing_time }] : []) , special };
  const day = new Date(`${key}T12:00:00`).getDay();
  const hours = await BusinessHour.findOne({ where: { day_of_week: day }, include: [{ model: BusinessHourPeriod, as: 'periods', order: [['sort_order', 'ASC']] }] });
  return { closed: !hours || Boolean(hours.is_closed), slots: hours ? hours.periods.map(period => ({ start: period.start_time, end: period.end_time })) : [], special: null };
}

module.exports = { DAYS, validTime, normalizeSlots, getWeeklyHours, getSpecialOpenings, getPublicSchedule, saveWeeklyHours, saveSpecialOpening, getWindowsForDate };
