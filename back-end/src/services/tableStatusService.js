const { Op } = require('sequelize');
const { Reservation, RestaurantTable } = require('../models');

const DEFAULT_RESERVATION_DURATION_HOURS = Number(process.env.RESERVATION_DURATION_HOURS || 2);

function addDuration(date, hours = DEFAULT_RESERVATION_DURATION_HOURS) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function assignedTablePattern(tableId) {
  const idPattern = Number.isFinite(Number(tableId)) ? Number(tableId) : String(tableId);
  return [
    `%"id":${idPattern},%`,
    `%"id":${idPattern}}%`,
  ];
}

async function refreshTableStatus(tableId) {
  const table = await RestaurantTable.findByPk(tableId);
  if (!table) {
    return null;
  }

  const activeReservations = await Reservation.findAll({
    where: {
      [Op.or]: [
        { table_id: tableId },
        {
          [Op.or]: assignedTablePattern(tableId).map((pattern) => ({
            assigned_tables: { [Op.like]: pattern },
          })),
        },
      ],
      status: {
        [Op.in]: ['PENDING', 'CONFIRMED'],
      },
    },
    order: [['reservation_date', 'ASC']],
  });

  const now = new Date();
  const activeNow = activeReservations.find((reservation) => {
    const start = new Date(reservation.reservation_date);
    const end = addDuration(start);
    return start <= now && end > now && reservation.status === 'CONFIRMED';
  });

  if (activeNow) {
    table.status = 'OCCUPIED';
  } else if (activeReservations.length > 0) {
    table.status = 'RESERVED';
  } else {
    table.status = 'FREE';
  }

  await table.save();
  return table;
}

async function refreshAllTablesStatus() {
  const tables = await RestaurantTable.findAll();
  for (const table of tables) {
    await refreshTableStatus(table.id);
  }
  return tables;
}

module.exports = {
  refreshTableStatus,
  refreshAllTablesStatus,
};
