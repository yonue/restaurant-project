const { Op } = require('sequelize');
const { Reservation, RestaurantTable, User, Role, Order, OrderItem, Product } = require('../models');
const { toCsv, buildPdf } = require('../services/exportService');
const { logActivity } = require('../services/activityLogService');
const { hasAnyRole } = require('../utils/roles');

function isAdminOrManager(user) {
  return hasAnyRole(user, ['Administrator', 'Manager']);
}

function parseDateFilter(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleString('fr-FR');
}

async function getOrdersData({ from, to }) {
  const where = {};
  if (from || to) {
    where.order_date = {};
    if (from) {
      where.order_date[Op.gte] = from;
    }
    if (to) {
      where.order_date[Op.lte] = to;
    }
  }

  const orders = await Order.findAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] },
      {
        model: OrderItem,
        as: 'items',
        include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }],
      },
    ],
    order: [['order_date', 'DESC']],
  });

  return orders.map((order) => ({
    id: order.id,
    customer: [order.user?.first_name, order.user?.last_name].filter(Boolean).join(' '),
    email: order.user?.email || '',
    status: order.status,
    payment_status: order.payment_status,
    total_amount: order.total_amount,
    items_count: order.items?.length || 0,
    products: (order.items || [])
      .map((item) => `${item.product?.name || 'Produit'} x${item.quantity}`)
      .join(' | '),
    order_date: formatDate(order.order_date),
  }));
}

async function getReservationsData({ from, to }) {
  const where = {};
  if (from || to) {
    where.reservation_date = {};
    if (from) {
      where.reservation_date[Op.gte] = from;
    }
    if (to) {
      where.reservation_date[Op.lte] = to;
    }
  }

  const reservations = await Reservation.findAll({
    where,
    include: [
      { model: User, as: 'user', attributes: ['id', 'first_name', 'last_name', 'email'] },
      { model: RestaurantTable, as: 'table', attributes: ['id', 'table_number', 'capacity'] },
    ],
    order: [['reservation_date', 'DESC']],
  });

  return reservations.map((reservation) => ({
    id: reservation.id,
    customer: [reservation.user?.first_name, reservation.user?.last_name].filter(Boolean).join(' '),
    email: reservation.user?.email || '',
    table_number: reservation.table?.table_number || '',
    capacity: reservation.table?.capacity || '',
    number_of_guests: reservation.number_of_guests,
    status: reservation.status,
    reservation_date: formatDate(reservation.reservation_date),
    special_request: reservation.special_request || '',
  }));
}

function buildOrdersCsv(rows) {
  return toCsv(rows, [
    { label: 'ID', value: (row) => row.id },
    { label: 'Client', value: (row) => row.customer },
    { label: 'Email', value: (row) => row.email },
    { label: 'Statut', value: (row) => row.status },
    { label: 'Paiement', value: (row) => row.payment_status },
    { label: 'Total', value: (row) => row.total_amount },
    { label: 'Nb articles', value: (row) => row.items_count },
    { label: 'Produits', value: (row) => row.products },
    { label: 'Date', value: (row) => row.order_date },
  ]);
}

function buildReservationsCsv(rows) {
  return toCsv(rows, [
    { label: 'ID', value: (row) => row.id },
    { label: 'Client', value: (row) => row.customer },
    { label: 'Email', value: (row) => row.email },
    { label: 'Table', value: (row) => row.table_number },
    { label: 'Capacité', value: (row) => row.capacity },
    { label: 'Invités', value: (row) => row.number_of_guests },
    { label: 'Statut', value: (row) => row.status },
    { label: 'Date', value: (row) => row.reservation_date },
    { label: 'Demande', value: (row) => row.special_request },
  ]);
}

function buildOrdersPdf(rows) {
  const lines = [
    'Export des commandes',
    '',
    ...rows.map(
      (row) =>
        `#${row.id} | ${row.customer} | ${row.status} | ${row.payment_status} | ${row.total_amount} | ${row.order_date} | ${row.products}`
    ),
  ];

  return buildPdf(lines, 'Export des commandes');
}

function buildReservationsPdf(rows) {
  const lines = [
    'Export des reservations',
    '',
    ...rows.map(
      (row) =>
        `#${row.id} | ${row.customer} | table ${row.table_number} | ${row.number_of_guests} pers | ${row.status} | ${row.reservation_date} | ${row.special_request}`
    ),
  ];

  return buildPdf(lines, 'Export des reservations');
}

async function sendExportResponse({ res, filenameBase, format, csvBuilder, pdfBuilder, rows }) {
  const selectedFormat = String(format || 'csv').toLowerCase();

  if (selectedFormat === 'pdf') {
    const pdfBuffer = pdfBuilder(rows);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);
    return res.send(pdfBuffer);
  }

  const csv = csvBuilder(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.csv"`);
  return res.send(csv);
}

exports.exportOrders = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const from = parseDateFilter(req.query.from);
    const to = parseDateFilter(req.query.to);
    const rows = await getOrdersData({ from, to });

    await logActivity({
      userId: req.user.id,
      action: `EXPORT_ORDERS_${String(req.query.format || 'csv').toUpperCase()}`,
      entity: 'Export',
      entityId: 'orders',
    });

    return sendExportResponse({
      res,
      filenameBase: 'orders-export',
      format: req.query.format,
      csvBuilder: buildOrdersCsv,
      pdfBuilder: buildOrdersPdf,
      rows,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.exportReservations = async (req, res) => {
  try {
    if (!isAdminOrManager(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const from = parseDateFilter(req.query.from);
    const to = parseDateFilter(req.query.to);
    const rows = await getReservationsData({ from, to });

    await logActivity({
      userId: req.user.id,
      action: `EXPORT_RESERVATIONS_${String(req.query.format || 'csv').toUpperCase()}`,
      entity: 'Export',
      entityId: 'reservations',
    });

    return sendExportResponse({
      res,
      filenameBase: 'reservations-export',
      format: req.query.format,
      csvBuilder: buildReservationsCsv,
      pdfBuilder: buildReservationsPdf,
      rows,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
