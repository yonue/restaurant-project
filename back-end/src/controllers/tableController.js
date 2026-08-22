const { Op } = require('sequelize');
const { RestaurantTable, Reservation, RestaurantZone } = require('../models');
const { refreshTableStatus, refreshAllTablesStatus } = require('../services/tableStatusService');
const { hasAnyRole } = require('../utils/roles');

function normalizeTable(tableInstance) {
  if (!tableInstance) {
    return null;
  }

  return tableInstance.toJSON ? tableInstance.toJSON() : { ...tableInstance };
}

function isRestaurantStaff(user) {
  return hasAnyRole(user, ['Administrator', 'Manager', 'Employee']);
}

function isValidTableStatus(status) {
  return ['FREE', 'RESERVED', 'OCCUPIED'].includes(status);
}

function assignedTablePatterns(tableId) {
  const idPattern = Number.isFinite(Number(tableId)) ? Number(tableId) : String(tableId);
  return [
    `%"id":${idPattern},%`,
    `%"id":${idPattern}}%`,
  ];
}

exports.createTable = async (req, res) => {
  try {
    const { table_number, capacity, status, is_active, position_x, position_y, width, height, rotation, shape, zone, zone_id, color, notes } = req.body;

    if (!table_number || capacity === undefined) {
      return res.status(400).json({
        message: 'table_number et capacity sont obligatoires.',
      });
    }

    if (!isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    if (!zone_id) return res.status(400).json({ message: 'La zone de la table est obligatoire.' });
    const room = await RestaurantZone.findOne({ where: { id: zone_id, is_active: true } });
    if (!room) return res.status(400).json({ message: 'La zone sélectionnée est introuvable ou inactive.' });

    const existingTable = await RestaurantTable.findOne({ where: { table_number } });
    if (existingTable) {
      return res.status(400).json({ message: 'Ce numéro de table existe déjà.' });
    }

    const table = await RestaurantTable.create({
      table_number,
      capacity,
      status: isValidTableStatus(status) ? status : 'FREE',
      position_x, position_y, width, height, rotation, shape, zone: zone || room.name, zone_id: room.id, is_active: is_active !== false, color, notes,
    });

    return res.status(201).json({
      message: 'Table créée avec succès.',
      table: normalizeTable(table),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllTables = async (req, res) => {
  try {
    await refreshAllTablesStatus();
    const tables = await RestaurantTable.findAll({
      order: [['table_number', 'ASC']],
      include: [{ model: Reservation, as: 'reservations' }, { model: RestaurantZone, as: 'room', attributes: ['id', 'name', 'description', 'min_capacity', 'max_capacity', 'is_active', 'image_path'] }],
    });

    return res.status(200).json({
      tables: tables.map(normalizeTable),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getTableById = async (req, res) => {
  try {
    const { id } = req.params;
    const table = await RestaurantTable.findByPk(id, {
      include: [{ model: Reservation, as: 'reservations' }, { model: RestaurantZone, as: 'room' }],
    });

    if (!table) {
      return res.status(404).json({ message: 'Table introuvable.' });
    }

    await refreshTableStatus(table.id);
    const refreshed = await RestaurantTable.findByPk(id, {
      include: [{ model: Reservation, as: 'reservations' }],
    });

    return res.status(200).json({
      table: normalizeTable(refreshed),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateTable = async (req, res) => {
  try {
    if (!isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const table = await RestaurantTable.findByPk(id);

    if (!table) {
      return res.status(404).json({ message: 'Table introuvable.' });
    }

    const { table_number, capacity, status, is_active, position_x, position_y, width, height, rotation, shape, zone, zone_id, color, notes } = req.body;

    if (table_number && table_number !== table.table_number) {
      const existingTable = await RestaurantTable.findOne({ where: { table_number } });
      if (existingTable) {
        return res.status(400).json({ message: 'Ce numéro de table existe déjà.' });
      }
    }

    if (zone_id !== undefined) {
      const room = await RestaurantZone.findOne({ where: { id: zone_id, is_active: true } });
      if (!room) return res.status(400).json({ message: 'La zone sélectionnée est introuvable ou inactive.' });
      table.zone_id = room.id;
      table.zone = zone || room.name;
    }

    table.table_number = table_number ?? table.table_number;
    table.capacity = capacity ?? table.capacity;
    if (status !== undefined) {
      if (!isValidTableStatus(status)) {
        return res.status(400).json({
          message: 'status doit être FREE, RESERVED ou OCCUPIED.',
        });
      }
      table.status = status;
    }
    for (const [key, value] of Object.entries({ position_x, position_y, width, height, rotation, shape, zone, is_active, color, notes })) {
      if (value !== undefined) table[key] = value;
    }

    await table.save();
    await refreshTableStatus(table.id);

    return res.status(200).json({
      message: 'Table mise à jour.',
      table: normalizeTable(table),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteTable = async (req, res) => {
  try {
    if (!isRestaurantStaff(req.user)) {
      return res.status(403).json({ message: 'Accès refusé.' });
    }

    const { id } = req.params;
    const table = await RestaurantTable.findByPk(id);

    if (!table) {
      return res.status(404).json({ message: 'Table introuvable.' });
    }

    const linkedReservations = await Reservation.count({
      where: {
        [Op.or]: [
          { table_id: table.id },
          {
            [Op.or]: assignedTablePatterns(table.id).map((pattern) => ({
              assigned_tables: { [Op.like]: pattern },
            })),
          },
        ],
      },
    });
    if (linkedReservations > 0) {
      return res.status(400).json({
        message: 'Impossible de supprimer une table liée à des réservations.',
      });
    }

    await table.destroy();

    return res.status(200).json({ message: 'Table supprimée.' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.syncTableStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const table = await refreshTableStatus(id);

    if (!table) {
      return res.status(404).json({ message: 'Table introuvable.' });
    }

    return res.status(200).json({
      message: 'État de la table synchronisé.',
      table: normalizeTable(table),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
