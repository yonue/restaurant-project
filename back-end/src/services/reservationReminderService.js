const { Op } = require('sequelize');
const { Reservation, User, RestaurantTable, ActivityLog } = require('../models');
const { sendReservationReminderEmail } = require('./nodemailerService');
const { createNotificationForUser } = require('./notificationService');
const { isNotificationEnabled } = require('./configService');

let reminderLoopStarted = false;
let reminderRunning = false;
let reminderTimer = null;

async function hasReminderAlreadyBeenSent(reservationId) {
  const existing = await ActivityLog.findOne({
    where: {
      entity: 'Reservation',
      entity_id: String(reservationId),
      action: 'RESERVATION_REMINDER_SENT',
    },
  });

  return Boolean(existing);
}

async function sendReminderForReservation(reservation) {
  if (!(await isNotificationEnabled('reminder'))) return;
  const email = reservation.guest_email || reservation.user?.email;
  if (!email) {
    return { emailSent: false, notificationSent: false };
  }

  let emailSent = true;
  try {
    await sendReservationReminderEmail({
      to: email,
      name: reservation.guest_name || (reservation.user ? `${reservation.user.first_name || ''} ${reservation.user.last_name || ''}`.trim() : 'Client'),
      reservationId: reservation.id,
      reservationDate: reservation.reservation_date,
      tableNumber: reservation.table?.table_number,
      specialRequest: reservation.special_request,
      specialOccasion: reservation.special_occasion,
    });
  } catch (error) {
    emailSent = false;
    console.error('Erreur envoi rappel réservation:', error.message);
  }

  let notificationSent = true;
  try {
    await createNotificationForUser(reservation.user_id, {
      title: 'Rappel de réservation',
      message: `Votre réservation #${reservation.id} est prévue bientôt.`,
      type: 'RESERVATION',
    });
  } catch (error) {
    notificationSent = false;
    console.error('Erreur notification rappel réservation:', error.message);
  }

  if (emailSent) {
    await ActivityLog.create({
      user_id: reservation.user_id,
      action: 'RESERVATION_REMINDER_SENT',
      entity: 'Reservation',
      entity_id: String(reservation.id),
    });
  }

  return { emailSent, notificationSent };
}

async function processReservationReminders() {
  if (reminderRunning) {
    return { skipped: true };
  }

  reminderRunning = true;
  try {
    const now = new Date();
    const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const reservations = await Reservation.findAll({
      where: {
        status: 'CONFIRMED',
        reservation_date: {
          [Op.between]: [from, to],
        },
      },
      include: [
        { model: User, as: 'user' },
        { model: RestaurantTable, as: 'table' },
      ],
      order: [['reservation_date', 'ASC']],
    });

    let processed = 0;
    for (const reservation of reservations) {
      if (await hasReminderAlreadyBeenSent(reservation.id)) {
        continue;
      }

      await sendReminderForReservation(reservation);
      processed += 1;
    }

    return { processed };
  } finally {
    reminderRunning = false;
  }
}

function startReservationReminderScheduler() {
  if (reminderLoopStarted) {
    return;
  }

  reminderLoopStarted = true;
  processReservationReminders().catch((error) => {
    console.error('Erreur initiale rappels réservation:', error.message);
  });

  reminderTimer = setInterval(() => {
    processReservationReminders().catch((error) => {
      console.error('Erreur rappels réservation:', error.message);
    });
  }, 15 * 60 * 1000);
}

function stopReservationReminderScheduler() {
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
    reminderLoopStarted = false;
  }
}

module.exports = {
  startReservationReminderScheduler,
  stopReservationReminderScheduler,
  processReservationReminders,
};
