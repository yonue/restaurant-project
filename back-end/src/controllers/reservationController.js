const { Op } = require('sequelize');
const { sequelize, Reservation, RestaurantTable, RestaurantZone, User, Role, RestaurantSettings } = require('../models');
const { sendReservationDecisionEmail, sendReservationConfirmationEmail } = require('../services/nodemailerService');
const { refreshTableStatus } = require('../services/tableStatusService');
const { logActivity } = require('../services/activityLogService');
const {
  notifyStaffAboutNewReservation,
  notifyReservationDecision,
} = require('../services/notificationService');
const { isNotificationEnabled } = require('../services/configService');
const { hasAnyRole, ensureRoleName } = require('../utils/roles');
const { getWindowsForDate } = require('../services/businessHoursService');

const DEFAULT_RESERVATION_DURATION_HOURS = Number(process.env.RESERVATION_DURATION_HOURS || 2);
const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const FRENCH_DAY_TO_INDEX = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseWebsiteContent(settingsRow) {
  const rawContent = settingsRow?.website_content || settingsRow?.description;
  if (!rawContent || typeof rawContent !== 'string') return {};
  try {
    const parsed = JSON.parse(rawContent);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function addDuration(date, hours = DEFAULT_RESERVATION_DURATION_HOURS) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function parseTimeToMinutes(value) {
  if (!value) return null;
  const match = String(value).trim().match(/(\d{1,2})\s*[h:]\s*(\d{2})/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function parseTimeRanges(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = [...text.matchAll(/(\d{1,2}\s*[h:]\s*\d{2})/gi)];
  const ranges = [];
  for (let index = 0; index + 1 < matches.length; index += 2) {
    const start = parseTimeToMinutes(matches[index][1]);
    const end = parseTimeToMinutes(matches[index + 1][1]);
    if (start !== null && end !== null && end > start) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

function expandDayExpression(expression) {
  if (!expression || typeof expression !== 'string') return [];
  const normalized = expression
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\bau\b/g, 'au');

  const tokens = normalized
    .split(/\s*(?:,|et)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const days = new Set();
  for (const token of tokens) {
    const rangeMatch = token.match(/(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\s+au\s+(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)/i);
    if (rangeMatch) {
      const start = FRENCH_DAY_TO_INDEX[rangeMatch[1]];
      const end = FRENCH_DAY_TO_INDEX[rangeMatch[2]];
      let cursor = start;
      while (true) {
        days.add(cursor);
        if (cursor === end) break;
        cursor = (cursor + 1) % 7;
      }
      continue;
    }

    const singleMatch = token.match(/(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)/i);
    if (singleMatch) {
      days.add(FRENCH_DAY_TO_INDEX[singleMatch[1].toLowerCase()]);
    }
  }

  return [...days];
}

function getScheduleMapFromSettingsRow(settingsRow) {
  const scheduleMap = new Map();
  const content = {
    ...parseWebsiteContent(settingsRow),
    ...(settingsRow?.schedule_settings && typeof settingsRow.schedule_settings === 'string'
      ? (() => { try { return JSON.parse(settingsRow.schedule_settings) || {}; } catch { return {}; } })()
      : {}),
  };
  const hasDailyFields = DAY_KEYS.some((key) => typeof content[key] === 'string' || Array.isArray(content.slots?.[key]));

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    scheduleMap.set(dayIndex, []);
  }

  if (hasDailyFields) {
    for (const [dayIndex, dayKey] of DAY_KEYS.entries()) {
      if (Array.isArray(content.slots?.[dayKey])) {
        scheduleMap.set(dayIndex, content.slots[dayKey].map(slot => ({ start: parseTimeToMinutes(slot.start), end: parseTimeToMinutes(slot.end) })).filter(range => range.start !== null && range.end !== null && range.end > range.start));
        continue;
      }
      const raw = content[dayKey];
      if (!raw || typeof raw !== 'string') continue;
      if (/ferm/i.test(raw) && !/\d/.test(raw)) {
        scheduleMap.set(dayIndex, []);
        continue;
      }
      const ranges = parseTimeRanges(raw);
      scheduleMap.set(dayIndex, ranges);
    }
    return scheduleMap;
  }

  const openingHoursText = String(settingsRow?.opening_hours || content.openingHours || content.opening_hours || '').trim();
  if (!openingHoursText) {
    return scheduleMap;
  }

  const segments = openingHoursText.split('|').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    const ranges = parseTimeRanges(openingHoursText);
    for (let i = 0; i < 7; i += 1) {
      scheduleMap.set(i, ranges);
    }
    return scheduleMap;
  }

  for (const segment of segments) {
    const colonMatch = segment.match(/^([^:]+):\s*(.+)$/);
    const dayExpression = colonMatch ? colonMatch[1].trim() : segment.replace(/ferm[ée]?\s*/i, '').replace(/\d{1,2}\s*[h:]\s*\d{2}.*$/, '').trim();
    const details = colonMatch ? colonMatch[2].trim() : segment.trim();
    const timeRanges = parseTimeRanges(details);
    const closed = /ferm/i.test(details) && timeRanges.length === 0;
    const targetedDays = expandDayExpression(dayExpression);
    const days = targetedDays.length > 0 ? targetedDays : [0, 1, 2, 3, 4, 5, 6];

    for (const dayIndex of days) {
      if (closed) {
        scheduleMap.set(dayIndex, []);
        continue;
      }
      if (timeRanges.length > 0) {
        const existing = scheduleMap.get(dayIndex) || [];
        scheduleMap.set(dayIndex, [...existing, ...timeRanges]);
      }
    }
  }

  return scheduleMap;
}

async function isReservationWithinOpeningHours(reservationDate) {
  const startDate = parseDate(reservationDate);
  if (!startDate) {
    return { ok: false, status: 400, message: 'reservation_date invalide.' };
  }

  const schedule = await getWindowsForDate(startDate.toISOString().slice(0, 10));
  if (schedule.closed || !schedule.slots.length) {
    return { ok: false, status: 400, message: 'Le restaurant est fermé à cette date.' };
  }

  const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
  const durationMinutes = DEFAULT_RESERVATION_DURATION_HOURS * 60;
  const endMinutes = startMinutes + durationMinutes;

  const toMinutes = value => { const [hours, minutes] = String(value).split(':').map(Number); return hours * 60 + minutes; };
  const isInsideWindow = schedule.slots.some(window => startMinutes >= toMinutes(window.start) && endMinutes <= toMinutes(window.end));
  if (!isInsideWindow) {
    return {
      ok: false,
      status: 400,
      message: 'Le créneau demandé est en dehors des horaires d’ouverture.',
    };
  }

  return { ok: true, startDate };
}

function normalizeReservation(reservationInstance) {
  if (!reservationInstance) {
    return null;
  }

  const raw = reservationInstance.toJSON ? reservationInstance.toJSON() : { ...reservationInstance };
  const reservationDate = raw.reservation_date ? new Date(raw.reservation_date) : null;
  const assignedTables = parseAssignedTables(raw.assigned_tables, raw.table);

  return {
    ...raw,
    customerName: raw.guest_name
      || (raw.user ? `${raw.user.first_name || ''} ${raw.user.last_name || ''}`.trim() : 'Client'),
    customerEmail: raw.guest_email || raw.user?.email || '',
    customerPhone: raw.guest_phone || raw.user?.phone || '',
    date: reservationDate ? reservationDate.toISOString().split('T')[0] : null,
    time: reservationDate
      ? reservationDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : null,
    guests: raw.number_of_guests,
    specialRequest: raw.special_request,
    specialOccasion: raw.special_occasion,
    assignedTableId: raw.table_id ? String(raw.table_id) : assignedTables[0]?.id || null,
    assignedTableIds: assignedTables.map((table) => table.id),
    assignedTables,
    zoneId: raw.zone_id ? String(raw.zone_id) : null,
    zone: raw.room || null,
  };
}

function parseAssignedTables(value, table = null) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item) return null;
        if (typeof item === 'string') {
          return { id: String(item), table_number: null, capacity: null };
        }
        if (typeof item === 'object') {
          const candidate = item;
          const id = candidate.id || candidate.table_id || candidate.tableId;
          if (!id) return null;
          return {
            id: String(id),
            table_number: candidate.table_number || candidate.tableNumber || null,
            capacity: candidate.capacity !== undefined ? Number(candidate.capacity) : null,
          };
        }
        return null;
      })
      .filter(Boolean);
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parseAssignedTables(parsed, table);
    } catch {
      return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => ({ id: entry, table_number: null, capacity: null }));
    }
  }

  if (table) {
    return [{
      id: String(table.id),
      table_number: table.table_number || null,
      capacity: table.capacity !== undefined ? Number(table.capacity) : null,
    }];
  }

  return [];
}

function serializeAssignedTables(tables = []) {
  return JSON.stringify(
    tables.map((table) => ({
      id: Number.isFinite(Number(table.id)) ? Number(table.id) : String(table.id),
      table_number: table.table_number || null,
      capacity: table.capacity !== undefined ? Number(table.capacity) : null,
    }))
  );
}

async function refreshReservationTables(reservation) {
  const tableIds = new Set();
  if (reservation?.table_id) {
    tableIds.add(String(reservation.table_id));
  }
  const assignedTables = parseAssignedTables(reservation?.assigned_tables);
  for (const table of assignedTables) {
    if (table?.id) {
      tableIds.add(String(table.id));
    }
  }

  for (const tableId of tableIds) {
    // Refresh each table touched by the reservation so capacities stay accurate.
    await refreshTableStatus(tableId);
  }
}

function isRestaurantStaff(user) {
  return hasAnyRole(user, ['Administrator', 'Manager', 'Employee']);
}

async function findOrCreateGuestUser({ guest_name, guest_email, guest_phone }) {
  const email = String(guest_email).trim().toLowerCase();
  const nameParts = String(guest_name).trim().split(' ');
  const first_name = nameParts[0] || 'Guest';
  const last_name = nameParts.slice(1).join(' ') || 'Guest';

  let user = await User.findOne({ where: { email } });
  if (!user) {
    const customerRole = await ensureRoleName('Customer', 'Client du restaurant');
    const bcrypt = require('bcrypt');
    const randomPassword = await bcrypt.hash(`guest-${Date.now()}-${Math.random()}`, 10);
    user = await User.create({
      first_name,
      last_name,
      email,
      phone: guest_phone || null,
      password: randomPassword,
      role_id: customerRole.id,
    });
  } else if (guest_phone && !user.phone) {
    user.phone = guest_phone;
    await user.save();
  }

  return user;
}

function reservationDecisionMessage(status) {
  if (status === 'CONFIRMED') {
    return 'Bonne nouvelle, votre réservation a été acceptée par le restaurant.';
  }

  return 'Nous sommes désolés, votre réservation a été refusée par le restaurant.';
}

async function findReservationConflicts(tableId, startDate, endDate, excludeReservationId = null) {
  const idPattern = Number.isFinite(Number(tableId)) ? Number(tableId) : String(tableId);
  const reservations = await Reservation.findAll({
    where: {
      [Op.or]: [
        { table_id: tableId },
        {
          [Op.or]: [
            { assigned_tables: { [Op.like]: `%"id":${idPattern},%` } },
            { assigned_tables: { [Op.like]: `%"id":${idPattern}}%` } },
          ],
        },
      ],
      status: {
        [Op.in]: ['PENDING', 'CONFIRMED'],
      },
      ...(excludeReservationId ? { id: { [Op.ne]: excludeReservationId } } : {}),
    },
  });

  return reservations.filter((reservation) => {
    const existingStart = new Date(reservation.reservation_date);
    const existingEnd = addDuration(existingStart);
    return overlaps(existingStart, existingEnd, startDate, endDate);
  });
}

async function findAvailableTablesAtTime(startDate, guests, excludeReservationId = null, zoneId = null) {
  const tables = await RestaurantTable.findAll({
    where: zoneId ? { zone_id: zoneId } : undefined,
    order: [['capacity', 'ASC'], ['table_number', 'ASC']],
  });

  const availableTables = [];
  for (const table of tables) {
    if (Number(table.capacity) <= 0) {
      continue;
    }

    const endDate = addDuration(startDate);
    const conflicts = await findReservationConflicts(table.id, startDate, endDate, excludeReservationId);
    if (conflicts.length === 0) {
      availableTables.push(table);
    }
  }

  return availableTables;
}

function scoreTableCombination(tables, guests) {
  const totalCapacity = tables.reduce((sum, table) => sum + Number(table.capacity || 0), 0);
  return {
    tables,
    totalCapacity,
    excess: totalCapacity - Number(guests),
    count: tables.length,
  };
}

function pickBestTableCombination(tables, guests) {
  const requiredGuests = Number(guests);
  const singleTable = tables
    .filter((table) => Number(table.capacity) >= requiredGuests)
    .sort((a, b) => Number(a.capacity) - Number(b.capacity) || Number(a.id) - Number(b.id))[0];

  if (singleTable) {
    return [singleTable];
  }

  const candidates = [];
  const sortedTables = [...tables].sort((a, b) => Number(a.capacity) - Number(b.capacity) || Number(a.id) - Number(b.id));

  const search = (startIndex, chosen, capacitySum) => {
    if (capacitySum >= requiredGuests && chosen.length > 0) {
      candidates.push(scoreTableCombination([...chosen], requiredGuests));
      return;
    }

    for (let i = startIndex; i < sortedTables.length; i += 1) {
      const table = sortedTables[i];
      chosen.push(table);
      search(i + 1, chosen, capacitySum + Number(table.capacity || 0));
      chosen.pop();
    }
  };

  search(0, [], 0);

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.excess !== b.excess) return a.excess - b.excess;
    if (a.count !== b.count) return a.count - b.count;
    if (a.totalCapacity !== b.totalCapacity) return a.totalCapacity - b.totalCapacity;
    return String(a.tables.map((table) => table.id).join('-')).localeCompare(String(b.tables.map((table) => table.id).join('-')));
  });

  return candidates[0].tables;
}

async function buildTableAssignment({ reservationDate, guests, excludeReservationId = null, preferredTableId = null, zoneId = null }) {
  const openingCheck = await isReservationWithinOpeningHours(reservationDate);
  if (!openingCheck.ok) {
    return openingCheck;
  }
  const { startDate } = openingCheck;

  const availableTables = await findAvailableTablesAtTime(startDate, guests, excludeReservationId, zoneId);
  if (availableTables.length === 0) {
    return { ok: false, status: 409, message: 'Aucune table disponible pour ce créneau.' };
  }

  if (preferredTableId) {
    const preferred = availableTables.find((table) => String(table.id) === String(preferredTableId));
    if (!preferred) {
      return { ok: false, status: 409, message: 'La table sélectionnée n\'est pas disponible à ce créneau.' };
    }
    if (Number(preferred.capacity) < Number(guests)) {
      return {
        ok: false,
        status: 400,
        message: `La table sélectionnée ne peut pas accueillir ${guests} convives.`,
      };
    }
    return {
      ok: true,
      startDate,
      tables: [preferred],
    };
  }

  const chosenTables = pickBestTableCombination(availableTables, guests);
  if (!chosenTables || chosenTables.length === 0) {
    return {
      ok: false,
      status: 409,
      message: 'Aucune combinaison de tables ne permet de satisfaire ce nombre de convives.',
    };
  }

  return {
    ok: true,
    startDate,
    tables: chosenTables,
  };
}

async function validateReservationPayload({
  tableId,
  reservationDate,
  guests,
  excludeReservationId = null,
  requireTable = true,
}) {
  const openingCheck = await isReservationWithinOpeningHours(reservationDate);
  if (!openingCheck.ok) {
    return openingCheck;
  }
  const { startDate } = openingCheck;

  if (requireTable) {
    const table = await RestaurantTable.findByPk(tableId);
    if (!table) {
      return { ok: false, status: 404, message: 'Table introuvable.' };
    }

    if (Number(guests) > Number(table.capacity)) {
      return {
        ok: false,
        status: 400,
        message: `Nombre maximal de personnes dépassé. Capacité de la table: ${table.capacity}.`,
      };
    }

    const endDate = addDuration(startDate);
    const conflicts = await findReservationConflicts(table.id, startDate, endDate, excludeReservationId);
    if (conflicts.length > 0) {
      return {
        ok: false,
        status: 409,
        message: 'Conflit horaire: la table est déjà réservée sur ce créneau.',
      };
    }

    return {
      ok: true,
      table,
      startDate,
      endDate,
    };
  }

  if (!Number.isInteger(Number(guests)) || Number(guests) <= 0) {
    return { ok: false, status: 400, message: 'Le nombre de personnes doit être supérieur à 0.' };
  }

  return {
    ok: true,
    table: null,
    startDate,
    endDate: addDuration(startDate),
  };
}

exports.getAvailableTables = async (req, res) => {
  try {
    const { reservation_date, number_of_guests, zone_id } = req.query;

    if (!reservation_date || !number_of_guests) {
      return res.status(400).json({
        message: 'reservation_date et number_of_guests sont obligatoires.',
      });
    }

    const openingCheck = await isReservationWithinOpeningHours(reservation_date);
    if (!openingCheck.ok) {
      return res.status(openingCheck.status).json({ message: openingCheck.message });
    }
    const { startDate } = openingCheck;

    const guests = Number(number_of_guests);
    const endDate = addDuration(startDate);
    if (zone_id) {
      const zone = await RestaurantZone.findOne({ where: { id: zone_id, is_active: true } });
      if (!zone) return res.status(404).json({ message: 'Zone introuvable ou inactive.' });
    }
    const tables = await RestaurantTable.findAll({ where: zone_id ? { zone_id } : undefined });

    const availableTables = [];

    for (const table of tables) {
      if (table.capacity < guests) {
        continue;
      }

      const conflicts = await findReservationConflicts(table.id, startDate, endDate);
      if (conflicts.length === 0) {
        availableTables.push(table);
      }
    }

    return res.status(200).json({ tables: availableTables });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createGuestReservation = async (req, res) => {
  try {
    const {
      guest_name,
      guest_email,
      guest_phone,
      reservation_date,
      number_of_guests,
      special_request,
      special_occasion,
      zone_id,
    } = req.body;

    if (!guest_name || !guest_email || !guest_phone || !reservation_date || number_of_guests === undefined) {
      return res.status(400).json({
        message: 'guest_name, guest_email, guest_phone, reservation_date et number_of_guests sont obligatoires.',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(guest_email).trim())) {
      return res.status(400).json({ message: 'Adresse email invalide.' });
    }

    const validation = await validateReservationPayload({
      tableId: null,
      reservationDate: reservation_date,
      guests: number_of_guests,
      requireTable: false,
    });

    if (!validation.ok) {
      return res.status(validation.status).json({ message: validation.message });
    }

    const guestUser = await findOrCreateGuestUser({ guest_name, guest_email, guest_phone });

    let selectedZone = null;
    if (zone_id) {
      selectedZone = await RestaurantZone.findOne({ where: { id: zone_id, is_active: true } });
      if (!selectedZone) return res.status(404).json({ message: 'Zone introuvable ou inactive.' });
      const available = await findAvailableTablesAtTime(validation.startDate, number_of_guests, null, zone_id);
      if (!pickBestTableCombination(available, number_of_guests)) return res.status(409).json({ message: 'Il n’y a plus de disponibilité dans cette zone pour ce créneau.' });
    }

    const reservation = await Reservation.create({
      user_id: guestUser.id,
      guest_name: String(guest_name).trim(),
      guest_email: String(guest_email).trim().toLowerCase(),
      guest_phone: String(guest_phone).trim(),
      table_id: null,
      zone_id: selectedZone ? selectedZone.id : null,
      reservation_date: validation.startDate,
      number_of_guests,
      special_request: special_request || null,
      special_occasion: special_occasion || null,
      status: 'PENDING',
    });

    let emailSent = true;
    try {
      if (!(await isNotificationEnabled('reservationConfirmation'))) throw new Error('Notification désactivée par la configuration');
      await sendReservationConfirmationEmail({
        to: reservation.guest_email,
        name: reservation.guest_name,
        reservationId: reservation.id,
        reservationDate: reservation.reservation_date,
        numberOfGuests: reservation.number_of_guests,
        specialRequest: reservation.special_request,
        specialOccasion: reservation.special_occasion,
      });
    } catch (emailError) {
      emailSent = false;
      console.error('Erreur envoi email confirmation réservation:', emailError.message);
    }

    let notificationSent = true;
    try {
      await notifyStaffAboutNewReservation(reservation);
    } catch (notificationError) {
      notificationSent = false;
      console.error('Erreur notification nouvelle réservation:', notificationError.message);
    }

    return res.status(201).json({
      message: 'Réservation créée avec succès.',
      emailSent,
      notificationSent,
      reservation: normalizeReservation(reservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.createReservation = async (req, res) => {
  try {
    const userId = isRestaurantStaff(req.user) && req.body.user_id ? req.body.user_id : req.user.id;
    const { table_id, zone_id, reservation_date, number_of_guests, special_request, special_occasion } = req.body;

    if (!reservation_date || number_of_guests === undefined) {
      return res.status(400).json({
        message: 'reservation_date et number_of_guests sont obligatoires.',
      });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const validation = await buildTableAssignment({
      preferredTableId: table_id,
      zoneId: zone_id || null,
      reservationDate: reservation_date,
      guests: number_of_guests,
    });

    if (!validation.ok) {
      return res.status(validation.status).json({ message: validation.message });
    }

    const reservation = await sequelize.transaction(async (transaction) => {
      const createdReservation = await Reservation.create(
        {
          user_id: user.id,
          table_id: validation.tables[0].id,
          zone_id: zone_id || validation.tables[0].zone_id || null,
          assigned_tables: serializeAssignedTables(validation.tables),
          reservation_date: validation.startDate,
          number_of_guests,
          special_request: special_request || null,
          special_occasion: special_occasion || null,
          status: 'PENDING',
        },
        { transaction }
      );

      return createdReservation;
    });

    await refreshReservationTables(reservation);
    let notificationSent = true;
    try {
      await notifyStaffAboutNewReservation(reservation);
    } catch (notificationError) {
      notificationSent = false;
      console.error('Erreur notification nouvelle réservation:', notificationError.message);
    }

    await logActivity({
      userId: req.user.id,
      action: 'RESERVATION_CREATED',
      entity: 'Reservation',
      entityId: reservation.id,
    });

    return res.status(201).json({
      message: 'Réservation créée avec succès.',
      notificationSent,
      reservation: normalizeReservation(reservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllReservations = async (req, res) => {
  try {
    if (!isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès réservé au personnel du restaurant.' });
    }

    const reservations = await Reservation.findAll({
      include: [
        { model: User, as: 'user' },
        { model: RestaurantTable, as: 'table' },
      ],
      order: [['reservation_date', 'DESC']],
    });

    return res.status(200).json({
      reservations: reservations.map(normalizeReservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getReservationById = async (req, res) => {
  try {
    const { id } = req.params;
    const reservation = await Reservation.findByPk(id, {
      include: [
        { model: User, as: 'user' },
        { model: RestaurantTable, as: 'table' },
      ],
    });

    if (!reservation) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }

    if (reservation.user_id && reservation.user_id !== req.user.id && !isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    return res.status(200).json({ reservation: normalizeReservation(reservation) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getMyReservations = async (req, res) => {
  try {
    const reservations = await Reservation.findAll({
      where: { user_id: req.user.id },
      include: [{ model: RestaurantTable, as: 'table' }],
      order: [['reservation_date', 'DESC']],
    });

    return res.status(200).json({
      reservations: reservations.map(normalizeReservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const reservation = await Reservation.findByPk(id);

    if (!reservation) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }

    if (reservation.user_id && reservation.user_id !== req.user.id && !isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const nextTableId = req.body.table_id !== undefined ? req.body.table_id : reservation.table_id;
    const nextZoneId = req.body.zone_id !== undefined ? req.body.zone_id : reservation.zone_id;
    const nextDate = req.body.reservation_date ?? reservation.reservation_date;
    const nextGuests = req.body.number_of_guests ?? reservation.number_of_guests;
    const nextRequest = req.body.special_request ?? reservation.special_request;
    const nextOccasion = req.body.special_occasion ?? reservation.special_occasion;

    const validation = await buildTableAssignment({
      preferredTableId: nextTableId,
      zoneId: nextZoneId || null,
      reservationDate: nextDate,
      guests: nextGuests,
      excludeReservationId: reservation.id,
    });

    if (!validation.ok) {
      return res.status(validation.status).json({ message: validation.message });
    }

    reservation.table_id = validation.tables[0].id;
    reservation.zone_id = nextZoneId || validation.tables[0].zone_id || null;
    reservation.assigned_tables = serializeAssignedTables(validation.tables);
    reservation.reservation_date = validation.startDate;
    reservation.number_of_guests = nextGuests;
    reservation.special_request = nextRequest;
    reservation.special_occasion = nextOccasion;
    await reservation.save();

    await refreshReservationTables(reservation);

    await logActivity({
      userId: req.user.id,
      action: 'RESERVATION_UPDATED',
      entity: 'Reservation',
      entityId: reservation.id,
    });

    return res.status(200).json({
      message: 'Réservation mise à jour.',
      reservation: normalizeReservation(reservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.cancelReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const reservation = await Reservation.findByPk(id);

    if (!reservation) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }

    if (reservation.user_id && reservation.user_id !== req.user.id && !isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    reservation.status = 'CANCELLED';
    await reservation.save();

    await refreshReservationTables(reservation);
    await logActivity({
      userId: req.user.id,
      action: 'RESERVATION_CANCELLED',
      entity: 'Reservation',
      entityId: reservation.id,
    });

    return res.status(200).json({
      message: 'Réservation annulée.',
      reservation: normalizeReservation(reservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.acceptReservation = async (req, res) => {
  try {
    if (!isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const reservation = await Reservation.findByPk(id, {
      include: [
        { model: User, as: 'user' },
        { model: RestaurantTable, as: 'table' },
      ],
    });
    if (!reservation) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }

    const preferredTableId = req.body.table_id !== undefined ? req.body.table_id : reservation.table_id;
    const preferredZoneId = req.body.zone_id !== undefined ? req.body.zone_id : reservation.zone_id;
    const validation = await buildTableAssignment({
      preferredTableId,
      zoneId: preferredZoneId || null,
      reservationDate: reservation.reservation_date,
      guests: reservation.number_of_guests,
      excludeReservationId: reservation.id,
    });

    if (!validation.ok) {
      return res.status(validation.status).json({ message: validation.message });
    }

    reservation.table_id = validation.tables[0].id;
    reservation.zone_id = preferredZoneId || validation.tables[0].zone_id || null;
    reservation.assigned_tables = serializeAssignedTables(validation.tables);
    reservation.status = 'CONFIRMED';
    await reservation.save();

    const assignedTables = validation.tables;
    await refreshReservationTables(reservation);
    await logActivity({
      userId: req.user.id,
      action: 'RESERVATION_CONFIRMED',
      entity: 'Reservation',
      entityId: reservation.id,
    });

    let emailSent = true;
    try {
      const recipientEmail = reservation.guest_email || reservation.user?.email;
      const recipientName = reservation.guest_name
        || (reservation.user ? `${reservation.user.first_name} ${reservation.user.last_name}`.trim() : 'Client');
      if (recipientEmail) {
      if (await isNotificationEnabled('reservationConfirmation')) await sendReservationDecisionEmail({
          to: recipientEmail,
          name: recipientName,
          reservationId: reservation.id,
          status: reservation.status,
          reservationDate: reservation.reservation_date,
          tableNumber: reservation.table?.table_number || assignedTables.map((table) => table.table_number || table.id).join(', '),
          message: reservationDecisionMessage(reservation.status),
          specialRequest: reservation.special_request,
          specialOccasion: reservation.special_occasion,
        });
      }
    } catch (emailError) {
      emailSent = false;
      console.error('Erreur envoi email acceptation réservation:', emailError.message);
    }

    let notificationSent = true;
    try {
      if (reservation.user_id) {
        if (await isNotificationEnabled('browser')) await notifyReservationDecision(reservation.user_id, reservation, reservation.status);
      }
    } catch (notificationError) {
      notificationSent = false;
      console.error('Erreur notification acceptation réservation:', notificationError.message);
    }

    return res.status(200).json({
      message: 'Réservation acceptée.',
      emailSent,
      notificationSent,
      reservation: normalizeReservation(reservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.refuseReservation = async (req, res) => {
  try {
    if (!isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const reservation = await Reservation.findByPk(id, {
      include: [
        { model: User, as: 'user' },
        { model: RestaurantTable, as: 'table' },
      ],
    });
    if (!reservation) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }

    reservation.status = 'REFUSED';
    await reservation.save();
    await refreshReservationTables(reservation);
    await logActivity({
      userId: req.user.id,
      action: 'RESERVATION_REFUSED',
      entity: 'Reservation',
      entityId: reservation.id,
    });

    let emailSent = true;
    try {
      const recipientEmail = reservation.guest_email || reservation.user?.email;
      const recipientName = reservation.guest_name
        || (reservation.user ? `${reservation.user.first_name} ${reservation.user.last_name}`.trim() : 'Client');
      if (recipientEmail) {
        await sendReservationDecisionEmail({
          to: recipientEmail,
          name: recipientName,
          reservationId: reservation.id,
          status: reservation.status,
          reservationDate: reservation.reservation_date,
          tableNumber: reservation.table?.table_number,
          message: reservationDecisionMessage(reservation.status),
        });
      }
    } catch (emailError) {
      emailSent = false;
      console.error('Erreur envoi email refus réservation:', emailError.message);
    }

    let notificationSent = true;
    try {
      if (reservation.user_id) {
        await notifyReservationDecision(reservation.user_id, reservation, reservation.status);
      }
    } catch (notificationError) {
      notificationSent = false;
      console.error('Erreur notification refus réservation:', notificationError.message);
    }

    return res.status(200).json({
      message: 'Réservation refusée.',
      emailSent,
      notificationSent,
      reservation: normalizeReservation(reservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.postponeReservation = async (req, res) => {
  try {
    if (!isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const { reservation_date } = req.body;
    const reservation = await Reservation.findByPk(id);

    if (!reservation) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }

    if (!reservation_date) {
      return res.status(400).json({ message: 'reservation_date est obligatoire.' });
    }

    const validation = await validateReservationPayload({
      tableId: reservation.table_id,
      reservationDate: reservation_date,
      guests: reservation.number_of_guests,
      excludeReservationId: reservation.id,
    });

    if (!validation.ok) {
      return res.status(validation.status).json({ message: validation.message });
    }

    reservation.reservation_date = validation.startDate;
    await reservation.save();
    await refreshReservationTables(reservation);
    await logActivity({
      userId: req.user.id,
      action: 'RESERVATION_POSTPONED',
      entity: 'Reservation',
      entityId: reservation.id,
    });

    return res.status(200).json({
      message: 'Réservation reportée.',
      reservation: normalizeReservation(reservation),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
