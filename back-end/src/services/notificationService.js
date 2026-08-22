const { Notification, User, Role } = require('../models');
const { emitToRoom, emitGlobal } = require('./socketService');
const { hasAnyRole } = require('../utils/roles');
const { sendNewReservationAlertEmail } = require('./nodemailerService');
const { isNotificationEnabled } = require('./configService');

function isStaffRoleName(roleName) {
  return hasAnyRole({ role: { name: roleName } }, ['Administrator', 'Manager', 'Employee']);
}

async function createNotificationForUser(userId, payload) {
  const notification = await Notification.create({
    user_id: userId,
    title: payload.title,
    message: payload.message,
    type: payload.type || 'INFO',
    is_read: false,
  });

  emitToRoom(`user:${userId}`, 'notification:new', notification.toJSON());
  return notification;
}

async function notifyStaffAboutNewReservation(reservation) {
  if (!(await isNotificationEnabled('newReservation'))) return [];
  const staffUsers = await User.findAll({
    include: [{ model: Role, as: 'role' }],
  });

  const targets = staffUsers.filter((user) => isStaffRoleName(user.role?.name));
  const managerTargets = staffUsers.filter((user) => hasAnyRole(user, ['Manager']));

  const notificationPayload = {
    title: 'Nouvelle réservation',
    message: `Une nouvelle réservation #${reservation.id} a été créée pour la table ${reservation.table_id}.`,
    type: 'RESERVATION',
  };

  const created = [];
  for (const user of targets) {
    created.push(await createNotificationForUser(user.id, notificationPayload));
  }

  let assignedTables = [];
  if (Array.isArray(reservation.assigned_tables)) {
    assignedTables = reservation.assigned_tables;
  } else if (typeof reservation.assigned_tables === 'string' && reservation.assigned_tables.trim()) {
    try {
      const parsed = JSON.parse(reservation.assigned_tables);
      if (Array.isArray(parsed)) {
        assignedTables = parsed;
      }
    } catch {
      assignedTables = [];
    }
  }

  const tableSummary = assignedTables.length > 0
    ? assignedTables.map((table) => `Table ${table.table_number || table.id}${table.capacity ? ` (${table.capacity})` : ''}`).join(', ')
    : reservation.table_id
      ? `Table ${reservation.table_id}`
      : '';

  for (const manager of managerTargets) {
    if (!manager.email) continue;
    try {
      await sendNewReservationAlertEmail({
        to: manager.email,
        managerName: `${manager.first_name || ''} ${manager.last_name || ''}`.trim(),
        reservationId: reservation.id,
        customerName: reservation.guest_name || `${reservation.user?.first_name || ''} ${reservation.user?.last_name || ''}`.trim(),
        reservationDate: reservation.reservation_date,
        guests: reservation.number_of_guests,
        specialRequest: reservation.special_request,
        specialOccasion: reservation.special_occasion,
        tableSummary,
      });
    } catch (emailError) {
      console.error(`Erreur envoi email nouvelle réservation à ${manager.email}:`, emailError.message);
    }
  }

  emitGlobal('reservation:new', reservation.toJSON ? reservation.toJSON() : reservation);
  return created;
}

async function notifyReservationDecision(userId, reservation, decision) {
  const isAccepted = decision === 'CONFIRMED';
  const notification = await createNotificationForUser(userId, {
    title: isAccepted ? 'Réservation acceptée' : 'Réservation refusée',
    message: isAccepted
      ? `Votre réservation #${reservation.id} a été acceptée.`
      : `Votre réservation #${reservation.id} a été refusée.`,
    type: 'RESERVATION',
  });

  emitGlobal('reservation:decision', {
    userId,
    reservationId: reservation.id,
    status: decision,
  });

  return notification;
}

async function markNotificationAsRead(notificationId, userId) {
  const notification = await Notification.findOne({
    where: {
      id: notificationId,
      user_id: userId,
    },
  });

  if (!notification) {
    return null;
  }

  notification.is_read = true;
  await notification.save();
  return notification;
}

module.exports = {
  createNotificationForUser,
  notifyStaffAboutNewReservation,
  notifyReservationDecision,
  markNotificationAsRead,
};
