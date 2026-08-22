let nodemailer;

try {
  nodemailer = require('nodemailer');
} catch (error) {
  nodemailer = null;
}

const BRAND = {
  background: '#F6F6EE',
  surface: '#FFFFFF',
  border: '#D4D4C8',
  accent: '#624D16',
  text: '#1F2937',
  muted: '#6B7280',
};

function createTransport() {
  if (!nodemailer) {
    return null;
  }

  const service = process.env.MAIL_SERVICE || process.env.EMAIL_SERVICE || process.env.GMAIL_SERVICE || 'gmail';
  const user = process.env.MAIL_USER || process.env.EMAIL_USER || process.env.SMTP_USER || process.env.GMAIL_USER;
  const password = process.env.MAIL_PASSWORD || process.env.EMAIL_PASSWORD || process.env.SMTP_PASSWORD || process.env.GMAIL_PASSWORD;
  const host = process.env.SMTP_HOST || process.env.MAIL_HOST || process.env.EMAIL_HOST;
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || process.env.EMAIL_PORT || 465);
  const secureEnv = process.env.SMTP_SECURE || process.env.MAIL_SECURE || process.env.EMAIL_SECURE;

  if (!user || !password) {
    return null;
  }

  if (host) {
    const secure = secureEnv ? secureEnv === 'true' : port === 465;
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass: password,
      },
    });
  }

  return nodemailer.createTransport({
    service,
    auth: {
      user,
      pass: password,
    },
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

function renderEmailLayout({ title, eyebrow, body, cta, footerNote, highlight }) {
  let html = '';
  html += '<div style="margin:0;padding:0;background:' + BRAND.background + ';width:100%;font-family:Arial,Helvetica,sans-serif;color:' + BRAND.text + ';">';
  html += '<div style="max-width:680px;margin:0 auto;padding:32px 16px;">';
  html += '<div style="background:' + BRAND.surface + ';border:1px solid ' + BRAND.border + ';border-radius:24px;overflow:hidden;box-shadow:0 24px 60px rgba(98,77,22,0.08);">';
  html += '<div style="background:linear-gradient(135deg, ' + BRAND.accent + ', #8A6A2A);padding:28px 32px;color:#fff;">';
  html += '<div style="font-size:11px;letter-spacing:.28em;text-transform:uppercase;opacity:.9;">L\'Élixir Restaurant</div>';
  html += '<div style="margin-top:10px;font-size:28px;line-height:1.15;font-weight:700;">' + escapeHtml(title) + '</div>';
  if (eyebrow) {
    html += '<div style="margin-top:10px;font-size:13px;opacity:.92;">' + escapeHtml(eyebrow) + '</div>';
  }
  html += '</div>';
  html += '<div style="padding:32px;">';
  if (highlight) {
    html += '<div style="margin-bottom:24px;padding:16px 18px;background:rgba(98,77,22,.06);border:1px solid rgba(98,77,22,.16);border-radius:18px;color:' + BRAND.accent + ';font-weight:700;">' + highlight + '</div>';
  }
  html += '<div style="font-size:15px;line-height:1.8;color:' + BRAND.text + ';">' + body + '</div>';
  if (cta) {
    html += '<div style="margin-top:28px;"><a href="' + cta.href + '" style="display:inline-block;background:' + BRAND.accent + ';color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:14px;font-weight:700;">' + escapeHtml(cta.label) + '</a></div>';
  }
  if (footerNote) {
    html += '<div style="margin-top:28px;font-size:12px;line-height:1.7;color:' + BRAND.muted + ';">' + footerNote + '</div>';
  }
  html += '</div>';
  html += '</div>';
  html += '<div style="text-align:center;margin-top:16px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:' + BRAND.muted + ';">Maison gastronomique &amp; expérience de prestige</div>';
  html += '</div>';
  html += '</div>';
  return html;
}

async function sendOtpEmail(_ref) {
  const { to, name, code, expiresAt } = _ref;
  const transporter = createTransport();
  const from = process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@restaurant.local';
  const subject = 'Votre code OTP de connexion';
  const html = renderEmailLayout({
    title: 'Code de connexion',
    eyebrow: 'Bonjour ' + escapeHtml(name || "chef d'équipe") + ',',
    highlight: 'Code OTP : ' + escapeHtml(code),
    body: '<p style="margin:0 0 16px 0;">Voici votre code de connexion temporaire pour accéder à votre espace sécurisé.</p>' +
      '<p style="margin:0 0 16px 0;"><strong>Expiration :</strong> ' + escapeHtml(formatDate(expiresAt)) + '</p>' +
      "<p style=\"margin:0;\">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>",
    footerNote: 'Le code est valable pour une seule connexion.',
  });

  if (!transporter) {
    console.warn('[OTP EMAIL MOCK] To: ' + to + ' | Code: ' + code);
    return { mocked: true, reason: 'Email transport not configured' };
  }

  return transporter.sendMail({ from, to, subject, html });
}

async function sendEmployeeInitialPasswordEmail(_ref2) {
  const { to, name, position, email, password } = _ref2;
  const transporter = createTransport();
  const from = process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@restaurant.local';
  const subject = 'Vos accès au système de gestion';
  const html = renderEmailLayout({
    title: "Bienvenue dans l'équipe",
    eyebrow: 'Bonjour ' + escapeHtml(name || '') + ', votre compte personnel est prêt.',
    highlight: 'Mot de passe initial : ' + escapeHtml(password),
    body: '<p style="margin:0 0 16px 0;">Nous avons créé votre accès pour le poste <strong>' + escapeHtml(position || 'Employé') + '</strong>.</p>' +
      '<p style="margin:0 0 16px 0;"><strong>Email de connexion :</strong> ' + escapeHtml(email) + '</p>' +
      '<p style="margin:0 0 16px 0;">Lors de votre première connexion, changez ce mot de passe pour un mot de passe personnel.</p>' +
      '<p style="margin:0;">Gardez cet email dans un endroit sécurisé.</p>',
    cta: { label: 'Ouvrir le portail', href: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/admin' },
    footerNote: 'Cet accès est strictement personnel.',
  });

  if (!transporter) {
    console.warn('[EMPLOYEE EMAIL MOCK] To: ' + to + ' | Password sent for: ' + email);
    return { mocked: true, reason: 'Email transport not configured' };
  }

  return transporter.sendMail({ from, to, subject, html });
}

async function sendNewReservationAlertEmail(_ref3) {
  const {
    to,
    managerName,
    reservationId,
    customerName,
    reservationDate,
    guests,
    specialRequest,
    specialOccasion,
    tableSummary,
  } = _ref3;
  const transporter = createTransport();
  const from = process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@restaurant.local';
  const subject = 'Nouvelle réservation à valider';
  const html = renderEmailLayout({
    title: 'Nouvelle réservation',
    eyebrow: 'Bonjour ' + escapeHtml(managerName || 'manager') + ',',
    highlight: 'Réservation #' + escapeHtml(reservationId),
    body: '<p style="margin:0 0 16px 0;">Une nouvelle réservation vient d\'être enregistrée et nécessite une validation.</p>' +
      '<p style="margin:0 0 16px 0;"><strong>Client :</strong> ' + escapeHtml(customerName || 'Client') + '</p>' +
      '<p style="margin:0 0 16px 0;"><strong>Date :</strong> ' + escapeHtml(formatDate(reservationDate)) + '</p>' +
      '<p style="margin:0 0 16px 0;"><strong>Convives :</strong> ' + escapeHtml(guests) + '</p>' +
      (tableSummary ? '<p style="margin:0 0 16px 0;"><strong>Suggestion de tables :</strong> ' + escapeHtml(tableSummary) + '</p>' : '') +
      (specialOccasion ? '<p style="margin:0 0 16px 0;"><strong>Occasion :</strong> ' + escapeHtml(specialOccasion) + '</p>' : '') +
      (specialRequest ? '<p style="margin:0 0 16px 0;"><strong>Demande :</strong> ' + escapeHtml(specialRequest) + '</p>' : '') +
      '<p style="margin:0;">Vous pouvez la confirmer ou la refuser depuis le panneau d\'administration.</p>',
    cta: { label: 'Ouvrir le tableau de bord', href: (process.env.FRONTEND_URL || 'http://localhost:3000') + '/admin' },
    footerNote: 'Cet email est envoyé automatiquement à l\'équipe de gestion.',
  });

  if (!transporter) {
    console.warn('[RESERVATION ALERT MOCK] To: ' + to + ' | Reservation: ' + reservationId);
    return { mocked: true, reason: 'Email transport not configured' };
  }

  return transporter.sendMail({ from, to, subject, html });
}

async function sendReservationDecisionEmail(_ref3) {
  const { to, name, reservationId, status, reservationDate, tableNumber, message, specialRequest, specialOccasion } = _ref3;
  const transporter = createTransport();
  const from = process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@restaurant.local';
  const decisionLabel = status === 'CONFIRMED' ? 'acceptée' : 'refusée';
  const subject = 'Votre réservation a été ' + decisionLabel;
  const html = renderEmailLayout({
    title: 'Réservation ' + decisionLabel,
    eyebrow: 'Bonjour ' + escapeHtml(name || '') + ',',
    highlight: 'Réservation #' + escapeHtml(reservationId) + ' ' + decisionLabel,
    body: '<p style="margin:0 0 16px 0;"><strong>Date :</strong> ' + escapeHtml(formatDate(reservationDate)) + '</p>' +
      '<p style="margin:0 0 16px 0;"><strong>Table :</strong> ' + escapeHtml(tableNumber || 'Non précisée') + '</p>' +
      (specialOccasion ? '<p style="margin:0 0 16px 0;"><strong>Occasion :</strong> ' + escapeHtml(specialOccasion) + '</p>' : '') +
      (specialRequest ? '<p style="margin:0 0 16px 0;"><strong>Demande :</strong> ' + escapeHtml(specialRequest) + '</p>' : '') +
      (message ? '<p style="margin:0;">' + escapeHtml(message) + '</p>' : '<p style="margin:0;">Merci pour votre confiance.</p>'),
    footerNote: 'Notre équipe reste à votre disposition pour toute précision.',
  });

  if (!transporter) {
    console.warn('[RESERVATION EMAIL MOCK] To: ' + to + ' | Status: ' + status + ' | Reservation: ' + reservationId);
    return { mocked: true, reason: 'Email transport not configured' };
  }

  return transporter.sendMail({ from, to, subject, html });
}

async function sendReservationReminderEmail(_ref4) {
  const { to, name, reservationId, reservationDate, tableNumber, specialRequest, specialOccasion } = _ref4;
  const transporter = createTransport();
  const from = process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@restaurant.local';
  const subject = 'Rappel de votre réservation';
  const html = renderEmailLayout({
    title: 'Rappel de réservation',
    eyebrow: 'Bonjour ' + escapeHtml(name || '') + ',',
    highlight: 'Réservation #' + escapeHtml(reservationId),
    body: '<p style="margin:0 0 16px 0;"><strong>Date :</strong> ' + escapeHtml(formatDate(reservationDate)) + '</p>' +
      '<p style="margin:0 0 16px 0;"><strong>Table :</strong> ' + escapeHtml(tableNumber || 'Non précisée') + '</p>' +
      (specialOccasion ? '<p style="margin:0 0 16px 0;"><strong>Occasion :</strong> ' + escapeHtml(specialOccasion) + '</p>' : '') +
      (specialRequest ? '<p style="margin:0 0 16px 0;"><strong>Demande :</strong> ' + escapeHtml(specialRequest) + '</p>' : '') +
      '<p style="margin: 10px 0;">Nous vous attendons avec plaisir à lheure prévue.</p>',
    footerNote: 'Pensez à nous prévenir en cas de changement.',
  });

  if (!transporter) {
    console.warn('[RESERVATION REMINDER MOCK] To: ' + to + ' | Reservation: ' + reservationId);
    return { mocked: true, reason: 'Email transport not configured' };
  }

  return transporter.sendMail({ from, to, subject, html });
}

async function sendReservationConfirmationEmail(_ref5) {
  const { to, name, reservationId, reservationDate, numberOfGuests, specialRequest, specialOccasion } = _ref5;
  const transporter = createTransport();
  const from = process.env.MAIL_FROM || process.env.GMAIL_USER || 'no-reply@restaurant.local';
  const subject = 'Confirmation de votre demande de réservation';
  const html = renderEmailLayout({
    title: 'Réservation reçue',
    eyebrow: 'Bonjour ' + escapeHtml(name || '') + ',',
    highlight: 'Demande #' + escapeHtml(reservationId) + ' enregistrée',
    body: '<p style="margin:0 0 16px 0;"><strong>Date :</strong> ' + escapeHtml(formatDate(reservationDate)) + '</p>' +
      '<p style="margin:0 0 16px 0;"><strong>Nombre de convives :</strong> ' + escapeHtml(numberOfGuests) + '</p>' +
      (specialOccasion ? '<p style="margin:0 0 16px 0;"><strong>Occasion spéciale :</strong> ' + escapeHtml(specialOccasion) + '</p>' : '') +
      (specialRequest ? '<p style="margin:0 0 16px 0;"><strong>Demandes spéciales :</strong> ' + escapeHtml(specialRequest) + '</p>' : '') +
      '<p style="margin:0;">Votre réservation est en attente de validation par notre équipe.</p>',
    footerNote: "Vous recevrez un second email dès qu'elle sera confirmée.",
  });

  if (!transporter) {
    console.warn('[RESERVATION CONFIRMATION MOCK] To: ' + to + ' | Reservation: ' + reservationId);
    return { mocked: true, reason: 'Email transport not configured' };
  }

  return transporter.sendMail({ from, to, subject, html });
}

module.exports = {
  sendOtpEmail,
  sendEmployeeInitialPasswordEmail,
  sendNewReservationAlertEmail,
  sendReservationDecisionEmail,
  sendReservationReminderEmail,
  sendReservationConfirmationEmail,
};
